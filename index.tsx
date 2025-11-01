import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI, Chat, FunctionDeclaration, Type } from "@google/genai";

const API_KEY = process.env.API_KEY;
const API_BASE = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_API_BASE) || 'http://localhost:4000';

// --- App Configuration from Environment Variables --- //
const parseCreditPackages = (str) => {
    if (!str) return null;
    try {
        const colors = ['green', 'blue', 'purple', 'orange'];
        return str.split(',').map((pkgStr, index) => {
            const parts = pkgStr.trim().split(':');
            return {
                price: parseInt(parts[0], 10),
                credits: parseInt(parts[1], 10),
                color: parts.find(p => colors.includes(p)) || colors[index % colors.length],
                popular: parts.includes('popular'),
            };
        });
    } catch (e) {
        console.error("Error parsing CREDIT_PACKAGES env var. Using defaults.", e);
        return null;
    }
};

const APP_CONFIG = {
  geminiModel: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
  assistantCreditCost: parseInt(process.env.ASSISTANT_CREDIT_COST || '1', 10),
  newUserStartingCredits: parseInt(process.env.NEW_USER_STARTING_CREDITS || '20', 10),
  creditPackages: parseCreditPackages(process.env.CREDIT_PACKAGES) || [
    { price: 20, credits: 200, color: 'green' },
    { price: 50, credits: 550, color: 'blue', popular: true },
    { price: 100, credits: 1200, color: 'purple' }
  ]
};


interface Message {
  sender: 'user' | 'assistant' | 'error' | 'tool_result';
  text: string;
  data?: any; // To hold structured data like generated content or exercises
}

// --- Initial Data --- //
const initialStudents = [
    { id: 101, name: 'Ana Silva', email: 'ana.silva@email.com', password: 'password123', role: 'student', credits: 15 },
    { id: 102, name: 'Bruno Costa', email: 'bruno.costa@email.com', password: 'password123', role: 'student', credits: 5 },
    { id: 103, name: 'Carlos Dias', email: 'carlos.dias@email.com', password: 'password123', role: 'student', credits: 0 },
];

const initialCourses = [
  { id: 1, name: 'Cálculo I', code: 'MAT101', teacher: 'Dr. Evelyn', content: { html: '<h1>Bem-vindo ao Cálculo I</h1><p>Esta é a introdução ao curso.</p>', js: 'console.log("Hello Cálculo I!");' }, exercises: [{ id: 1, type: 'multiple_choice', question: 'Qual a derivada de x^2?', options: ['2x', 'x', 'x^2', '2'], answer: '2x' }] },
  { id: 2, name: 'Introdução à Programação', code: 'CS101', teacher: 'Prof. Ricardo', content: { html: '<h2>Variáveis em JavaScript</h2><p>Variáveis são usadas para armazenar dados. Use <code>let</code>, <code>const</code>, ou <code>var</code>.</p>', js: 'let x = 10;\nconst PI = 3.14;\nconsole.log(x, PI);' }, exercises: [{id: 2, type: 'text_answer', question: 'Declare uma constante chamada "GRAVITY" com o valor 9.8', answer: 'const GRAVITY = 9.8;'}] },
  { id: 3, name: 'Física Clássica', code: 'PHY101', teacher: 'Dr. Monteiro', content: { html: '', js: '' }, exercises: [] },
  { id: 4, name: 'Comunicação e Escrita', code: 'LNG101', teacher: 'Prof. Lúcia', content: { html: '', js: '' }, exercises: [] },
];

const initialAnnouncements = [
  { id: 1, text: 'Inscrições para o próximo semestre abertas.', date: '2024-07-20' },
  { id: 2, text: 'Manutenção do sistema no próximo sábado.', date: '2024-07-18' },
  { id: 3, text: 'Palestra sobre carreira em IA na próxima sexta.', date: '2024-07-15' },
];

const mockGrades = [
  { id: 1, course: 'Introdução à Programação', grade: 'A' },
  { id: 2, course: 'Física Clássica', grade: 'B+' },
  { id: 3, course: 'Comunicação e Escrita', grade: 'A-' },
];

const mockSchedules = {
    'MAT101': 'Segundas e Quartas, 10:00 - 12:00, Sala 201',
    'CS101': 'Terças e Quintas, 14:00 - 16:00, Laboratório B',
    'PHY101': 'Segundas e Sextas, 08:00 - 10:00, Auditório 3',
    'LNG101': 'Quartas, 16:00 - 18:00, Sala 105',
};

const mockOfficeHours = {
    'Dr. Evelyn': 'Quartas, 13:00 - 15:00, Gabinete 12',
    'Prof. Ricardo': 'Quintas, 16:00 - 17:00 (online)',
    'Dr. Monteiro': 'Sextas, 10:00 - 11:00, Gabinete 15',
    'Prof. Lúcia': 'Terças, 11:00 - 12:00, Sala de Professores',
};


// A custom hook to keep state in localStorage
const useStickyState = (defaultValue, key) => {
    const [value, setValue] = useState(() => {
        try {
            const stickyValue = window.localStorage.getItem(key);
            return stickyValue !== null
                ? JSON.parse(stickyValue)
                : defaultValue;
        } catch (error) {
            console.warn(`Error reading localStorage key “${key}”:`, error);
            return defaultValue;
        }
    });

    useEffect(() => {
        try {
            window.localStorage.setItem(key, JSON.stringify(value));
        } catch (error) {
            console.warn(`Error setting localStorage key “${key}”:`, error);
        }
    }, [key, value]);

    return [value, setValue];
};


// --- Utility Functions --- //
const markdownToHtml = (text: string): string => {
    if (!text) return '';
    const sanitizedText = text.replace(/</g, "&lt;").replace(/>/g, "&gt;");

    const lines = sanitizedText.split('\n');
    const htmlLines: string[] = [];
    let inList: 'ul' | 'ol' | null = null;

    for (const line of lines) {
        if (inList && !line.match(/^(\*|\d+\.)\s/)) {
            htmlLines.push(`</${inList}>`);
            inList = null;
        }
        if (line.trim() === '---') {
            htmlLines.push('<hr/>');
        } else if (line.startsWith('### ')) {
            htmlLines.push(`<h3>${line.substring(4)}</h3>`);
        } else if (line.startsWith('## ')) {
            htmlLines.push(`<h2>${line.substring(3)}</h2>`);
        } else if (line.startsWith('# ')) {
            htmlLines.push(`<h1>${line.substring(2)}</h1>`);
        } else if (line.startsWith('* ')) {
            if (inList !== 'ul') {
                if (inList) htmlLines.push(`</${inList}>`);
                htmlLines.push('<ul>');
                inList = 'ul';
            }
            htmlLines.push(`<li>${line.substring(2)}</li>`);
        } else if (line.match(/^\d+\.\s/)) {
            if (inList !== 'ol') {
                if (inList) htmlLines.push(`</${inList}>`);
                htmlLines.push('<ol>');
                inList = 'ol';
            }
            htmlLines.push(`<li>${line.replace(/^\d+\.\s/, '')}</li>`);
        } else if (line.trim() !== '') {
            htmlLines.push(`<p>${line}</p>`);
        } else {
             if (htmlLines.length > 0 && htmlLines[htmlLines.length -1] !== '') {
                htmlLines.push('');
             }
        }
    }

    if (inList) {
        htmlLines.push(`</${inList}>`);
    }

    let finalHtml = htmlLines.join('\n').replace(/<p>\s*<\/p>/g, '');
    finalHtml = finalHtml.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    
    return finalHtml;
};

const ThemeToggler = ({ theme, toggleTheme }) => (
    <button onClick={toggleTheme} className="theme-toggle-button" aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}>
        {theme === 'light' ? '🌙' : '☀️'}
    </button>
);


// --- Components --- //
const AuthForm = ({ onLogin, onSignUp, theme, toggleTheme }) => {
    const [isLoginView, setIsLoginView] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [name, setName] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);
        try {
            // Simulate async operation
            await new Promise(resolve => setTimeout(resolve, 300));
            if (isLoginView) {
                if (!email || !password) throw new Error('Por favor, preencha todos os campos.');
                await onLogin(email, password);
            } else {
                if (!name || !email || !password) throw new Error('Por favor, preencha todos os campos.');
                await onSignUp(name, email, password);
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="login-container">
            <div className="login-card">
                <ThemeToggler theme={theme} toggleTheme={toggleTheme} />
                <h1>{isLoginView ? 'Login' : 'Criar Conta'}</h1>
                <p>Bem-vindo ao Portal Acadêmico</p>
                <form onSubmit={handleSubmit} className="auth-form">
                    {!isLoginView && <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome Completo" aria-label="Nome Completo" />}
                    <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" aria-label="Email"/>
                    <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Senha" aria-label="Senha"/>
                    {error && <p className="error-message">{error}</p>}
                    <button type="submit" className="login-button" disabled={isLoading}>
                        {isLoading ? (isLoginView ? 'Entrando...' : 'Criando...') : (isLoginView ? 'Entrar' : 'Criar Conta')}
                    </button>
                </form>
                <button onClick={() => { setIsLoginView(!isLoginView); setError(''); }} className="toggle-auth">
                    {isLoginView ? 'Não tem uma conta? Crie uma' : 'Já tem uma conta? Faça login'}
                </button>
            </div>
        </div>
    );
};

// --- Student Dashboard Components --- //
const CourseList = ({ courses, onCourseClick }) => (
  <div id="courses" className="dashboard-card">
    <h2>Meus Cursos</h2>
    <div className="course-list">
      <ul>
        {courses.map(course => (
          <li key={course.id} onClick={() => onCourseClick(course.id)} role="button" tabIndex={0}>
            {course.name}
            <span className="course-code">{course.code}</span>
          </li>
        ))}
      </ul>
    </div>
  </div>
);

const Announcements = ({ announcements }) => (
  <div id="announcements" className="dashboard-card">
    <h2>Comunicados</h2>
    <div className="announcements-list">
      <ul>
        {announcements.map(announcement => (
          <li key={announcement.id}>
            {announcement.text}
            <span className="announcement-date">{new Date(announcement.date).toLocaleDateString()}</span>
          </li>
        ))}
      </ul>
    </div>
  </div>
);

const GradesSummary = () => (
  <div id="grades" className="dashboard-card">
    <h2>Notas Recentes</h2>
    <div className="grades-list">
      <ul>
        {mockGrades.map(grade => (
          <li key={grade.id}>
            {grade.course}
            <span className="grade-value">{grade.grade}</span>
          </li>
        ))}
      </ul>
    </div>
  </div>
);

const StudentProgress = ({ grades }) => {
    const gradeToPoints = {
        'A': 4.0, 'A-': 3.7, 'B+': 3.3, 'B': 3.0, 'B-': 2.7,
        'C+': 2.3, 'C': 2.0, 'C-': 1.7, 'D': 1.0, 'F': 0.0,
    };

    const { percentage, summaryText } = useMemo(() => {
        if (!grades || grades.length === 0) {
            return { percentage: 0, summaryText: "Sem notas" };
        }
        const totalPoints = grades.reduce((acc, grade) => acc + (gradeToPoints[grade.grade] || 0), 0);
        const averagePoints = totalPoints / grades.length;
        const calculatedPercentage = Math.round((averagePoints / 4.0) * 100);

        let text = 'Bom';
        if (calculatedPercentage < 60) text = 'Precisa Melhorar';
        else if (calculatedPercentage >= 90) text = 'Excelente';
        
        return { percentage: calculatedPercentage, summaryText: text };
    }, [grades]);

    const radius = 52;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (percentage / 100) * circumference;

    return (
        <div id="progress" className="dashboard-card progress-card">
            <h2>Progresso Acadêmico</h2>
            <div className="progress-container">
                <div className="progress-circle-container">
                    <svg className="progress-circle" width="120" height="120">
                        <circle className="progress-circle-bg" cx="60" cy="60" r={radius} />
                        <circle
                            className="progress-circle-bar"
                            cx="60" cy="60"
                            r={radius}
                            style={{ strokeDashoffset: offset }}
                        />
                    </svg>
                    <span className="progress-text">{percentage}%</span>
                </div>
                <div className="progress-summary">
                    <p>Desempenho Geral</p>
                    <span>{summaryText}</span>
                </div>
            </div>
        </div>
    );
};

const PurchaseGadgets = ({ onPurchase, packages }) => {
    return (
        <div id="purchase" className="dashboard-card">
            <h2>Comprar Créditos</h2>
            <div className="purchase-gadgets-container">
                {packages.map(pkg => (
                    <div key={pkg.price} className={`gadget-card color-${pkg.color}`}>
                        {pkg.popular && <span className="popular-badge">Popular</span>}
                        <h3>Pacote de Créditos</h3>
                        <div className="gadget-credits">{pkg.credits}<span> créditos</span></div>
                        <div className="gadget-price">R$ {pkg.price},00</div>
                        <button onClick={() => onPurchase(pkg)}>Comprar Agora</button>
                    </div>
                ))}
            </div>
            <p className="purchase-info">Use créditos para interagir com o Assistente Acadêmico e acessar materiais.</p>
        </div>
    );
};

const AcademicAssistant = ({ credits, onUseCredit, modelName }) => {
  const [messages, setMessages] = useState<Message[]>([
    { sender: 'assistant', text: 'Olá! Como posso ajudar com seus estudos hoje? Pergunte-me sobre horários de aulas ou de professores.' }
  ]);
  const [userInput, setUserInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const chatWindowRef = useRef<HTMLDivElement>(null);
  const chatRef = useRef<Chat | null>(null);
  const hasCredits = credits > 0;

  // --- Tooling for AI --- //
  const getCourseSchedule = ({ courseName }) => {
      const course = initialCourses.find(c => c.name.toLowerCase() === courseName.toLowerCase());
      if (course) {
          return mockSchedules[course.code] || `Não encontrei um horário para ${courseName}.`;
      }
      return `Curso "${courseName}" não encontrado.`;
  };

  const getTeacherAvailability = ({ teacherName }) => {
      return mockOfficeHours[teacherName] || `Não encontrei horários de atendimento para ${teacherName}.`;
  };

  const availableTools = { getCourseSchedule, getTeacherAvailability };

  useEffect(() => {
    if (chatWindowRef.current) {
      chatWindowRef.current.scrollTop = chatWindowRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userInput.trim() || isLoading || !hasCredits) return;

    const newUserMessage: Message = { sender: 'user', text: userInput };
    setMessages(prev => [...prev, newUserMessage]);
    const currentInput = userInput;
    setUserInput('');
    setIsLoading(true);

    try {
      if (!chatRef.current) {
        const ai = new GoogleGenAI({ apiKey: API_KEY });
        
        const getCourseScheduleDeclaration: FunctionDeclaration = {
            name: 'getCourseSchedule',
            parameters: {
                type: Type.OBJECT,
                description: 'Obtém o horário de uma disciplina específica.',
                properties: { courseName: { type: Type.STRING, description: 'O nome da disciplina, ex: "Física Clássica"' } },
                required: ['courseName'],
            },
        };

        const getTeacherAvailabilityDeclaration: FunctionDeclaration = {
            name: 'getTeacherAvailability',
            parameters: {
                type: Type.OBJECT,
                description: 'Obtém os horários de atendimento de um professor.',
                properties: { teacherName: { type: Type.STRING, description: 'O nome do professor, ex: "Prof. Ricardo"' } },
                required: ['teacherName'],
            },
        };

        chatRef.current = ai.chats.create({
          model: modelName,
          config: {
              tools: [{ functionDeclarations: [getCourseScheduleDeclaration, getTeacherAvailabilityDeclaration] }],
              systemInstruction: "Você é um assistente acadêmico amigável. Use as ferramentas disponíveis para responder a perguntas sobre horários de aulas e disponibilidade de professores. Se a informação não estiver disponível, informe ao usuário.",
          }
        });
      }

      let response = await chatRef.current.sendMessage({ message: currentInput });
      
      const functionCalls = response.functionCalls;
      if (functionCalls && functionCalls.length > 0) {
        const functionResponses = [];
        for (const call of functionCalls) {
            if (availableTools[call.name]) {
                const result = availableTools[call.name](call.args);
                 functionResponses.push({
                    functionResponse: {
                        name: call.name,
                        response: { result },
                    },
                });
            }
        }

        if (functionResponses.length > 0) {
            response = await chatRef.current.sendMessage({ message: functionResponses });
        }
      }

      onUseCredit();
      const assistantResponse: Message = { sender: 'assistant', text: response.text };
      setMessages(prev => [...prev, assistantResponse]);

    } catch (error) {
      console.error('Error fetching from Gemini API:', error);
      const errorMessage: Message = { sender: 'error', text: 'Desculpe, não consegui processar sua solicitação. Tente novamente.' };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div id="assistant" className="dashboard-card assistant-card">
      <h2>Assistente Acadêmico</h2>
      <div className="chat-window" ref={chatWindowRef}>
        {messages.map((msg, index) => {
          if (msg.sender === 'assistant') {
            return (
              <div 
                key={index} 
                className={`chat-message ${msg.sender}`}
                dangerouslySetInnerHTML={{ __html: markdownToHtml(msg.text) }}
              />
            );
          }
          return (
            <div key={index} className={`chat-message ${msg.sender}`}>
              {msg.text}
            </div>
          );
        })}
        {isLoading && (
          <div className="chat-message assistant">
            <div className="loading-dots">
                <span></span><span></span><span></span>
            </div>
          </div>
        )}
      </div>
      <form className="chat-input-form" onSubmit={handleSendMessage}>
        <input
          type="text"
          value={userInput}
          onChange={(e) => setUserInput(e.target.value)}
          placeholder={hasCredits ? "Pergunte algo..." : "Você precisa de créditos para continuar."}
          disabled={isLoading || !hasCredits}
          aria-label="Sua mensagem para o assistente"
        />
        <button type="submit" disabled={isLoading || !hasCredits}>Enviar</button>
      </form>
    </div>
  );
};


const StudentDashboard = ({ courses, announcements, onCourseClick }) => (
    <main className="main-content student-view">
      <CourseList courses={courses} onCourseClick={onCourseClick} />
      <Announcements announcements={announcements} />
      <GradesSummary />
      <StudentProgress grades={mockGrades} />
    </main>
);

const Modal = ({ show, onClose, title, children }) => {
    if (!show) return null;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h2>{title}</h2>
                    <button onClick={onClose} className="modal-close-button">&times;</button>
                </div>
                <div className="modal-body">
                    {children}
                </div>
            </div>
        </div>
    );
};

const MultipleChoiceExercise = ({ exercise }) => {
    const [shuffledOptions, setShuffledOptions] = useState([]);
    const [selectedOption, setSelectedOption] = useState(null);
    const [isAnswered, setIsAnswered] = useState(false);
    const [showModal, setShowModal] = useState(false);

    useEffect(() => {
        setShuffledOptions([...exercise.options].sort(() => Math.random() - 0.5));
        setSelectedOption(null);
        setIsAnswered(false);
        setShowModal(false);
    }, [exercise]);

    const handleOptionClick = (option) => {
        if (isAnswered) return;
        setSelectedOption(option);
        setIsAnswered(true);
        setShowModal(true);
    };
    
    const isCorrect = selectedOption === exercise.answer;

    const getButtonClass = (option) => {
        if (!isAnswered) return '';
        if (option === exercise.answer) return 'correct';
        if (option === selectedOption && option !== exercise.answer) return 'incorrect';
        return 'disabled';
    };

    return (
        <>
            <div className="exercise-content">
                <strong>P:</strong> <pre className="exercise-text">{exercise.question}</pre>
                <div className="multiple-choice-options">
                    {shuffledOptions.map((option, index) => (
                        <button
                            key={index}
                            onClick={() => handleOptionClick(option)}
                            className={`option-button ${isAnswered ? getButtonClass(option) : ''}`}
                            disabled={isAnswered}
                        >
                            {option}
                        </button>
                    ))}
                </div>
            </div>
            <Modal
                show={showModal}
                onClose={() => setShowModal(false)}
                title={isCorrect ? "Parabéns!" : "Resposta Incorreta"}
            >
                {isCorrect ? (
                    <p>Você acertou a questão!</p>
                ) : (
                    <p>A resposta correta era: <strong>{exercise.answer}</strong></p>
                )}
            </Modal>
        </>
    );
};


const CourseDetailView = ({ course }) => {
    if (!course) {
        return <div className="dashboard-card"><p>Selecione um curso para ver os detalhes.</p></div>;
    }

    return (
        <div className="course-detail-view">
            <div className="dashboard-card">
                <h2>Conteúdo do Curso: {course.name}</h2>
                <div className="course-content-display">
                    <h4>Material de Aula</h4>
                    <div className="content-html" dangerouslySetInnerHTML={{ __html: course.content.html || "<p>Nenhum conteúdo HTML disponível.</p>" }}></div>
                    <h4>Exemplo de Código</h4>
                    <pre className="code-block"><code>{course.content.js || "// Nenhum código JavaScript disponível."}</code></pre>
                </div>
            </div>
             <div className="dashboard-card">
                <h3>Exercícios</h3>
                <ul className="exercise-list">
                    {course.exercises && course.exercises.length > 0 ? course.exercises.map(ex => (
                         <li key={ex.id} className="exercise-item">
                            {ex.type === 'multiple_choice' ? (
                                <MultipleChoiceExercise exercise={ex} />
                            ) : (
                                <div className="exercise-content">
                                    <strong>P:</strong> <pre className="exercise-text">{ex.question}</pre>
                                    <strong>R:</strong> <pre className="exercise-text">{ex.answer}</pre>
                                </div>
                            )}
                        </li>
                    )) : <p>Nenhum exercício disponível para este curso.</p>}
                </ul>
            </div>
        </div>
    );
};


// --- Admin Dashboard Components --- //

const AdminAssistant = ({ courseName, modelName, onApplyContent, onAddExercises }) => {
    const [messages, setMessages] = useState<Message[]>([
        { sender: 'assistant', text: `Olá! Como posso ajudar a criar o conteúdo para **${courseName}**? Peça para gerar conteúdo, exercícios ou um quiz de múltipla escolha sobre um tópico.` }
    ]);
    const [userInput, setUserInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const chatWindowRef = useRef<HTMLDivElement>(null);
    const chatRef = useRef<Chat | null>(null);
    const aiRef = useRef<GoogleGenAI | null>(null);

    useEffect(() => {
        if (chatWindowRef.current) {
            chatWindowRef.current.scrollTop = chatWindowRef.current.scrollHeight;
        }
    }, [messages]);
    
    const handleAddQuizAsExercises = (quiz) => {
        const formattedExercises = quiz.map(q => ({
            type: 'multiple_choice',
            question: q.question,
            options: Object.values(q.options),
            answer: q.options[q.answer]
        }));
        onAddExercises(formattedExercises);
    };

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!userInput.trim() || isLoading) return;

        const newUserMessage: Message = { sender: 'user', text: userInput };
        setMessages(prev => [...prev, newUserMessage]);
        const currentInput = userInput;
        setUserInput('');
        setIsLoading(true);

        try {
            if (!aiRef.current) {
                aiRef.current = new GoogleGenAI({ apiKey: API_KEY });
            }
            const ai = aiRef.current;

            if (!chatRef.current) {
                const generateContentDeclaration: FunctionDeclaration = {
                    name: 'generateCourseContent',
                    parameters: { type: Type.OBJECT, description: 'Gera conteúdo de aula em HTML e código de exemplo em JavaScript para um tópico específico.', properties: { topic: { type: Type.STRING, description: 'O tópico para o qual o conteúdo deve ser gerado, ex: "loops for em javascript"' } }, required: ['topic'] },
                };
                const generateExercisesDeclaration: FunctionDeclaration = {
                    name: 'generateExerciseQuestions',
                    parameters: { type: Type.OBJECT, description: 'Gera um número especificado de exercícios com perguntas e respostas para um tópico.', properties: { topic: { type: Type.STRING, description: 'O tópico para os exercícios, ex: "Arrays em JavaScript"' }, count: { type: Type.NUMBER, description: 'O número de exercícios a serem gerados.' } }, required: ['topic', 'count'] },
                };
                const generateMultipleChoiceQuizDeclaration: FunctionDeclaration = {
                    name: 'generateMultipleChoiceQuiz',
                    parameters: { type: Type.OBJECT, description: 'Gera um quiz de múltipla escolha com um número especificado de questões.', properties: { topic: { type: Type.STRING, description: 'O tópico para o quiz, ex: "Funções em JavaScript"' }, count: { type: Type.NUMBER, description: 'O número de questões a serem geradas.' } }, required: ['topic', 'count'] },
                };


                chatRef.current = ai.chats.create({
                    model: modelName,
                    config: {
                        tools: [{ functionDeclarations: [generateContentDeclaration, generateExercisesDeclaration, generateMultipleChoiceQuizDeclaration] }],
                        systemInstruction: `Você é um assistente de design instrucional especialista. Ajude o administrador a criar conteúdo de curso, exercícios e quizzes. Use as ferramentas disponíveis para gerar o material solicitado.`,
                    }
                });
            }

            const response = await chatRef.current.sendMessage({ message: currentInput });
            const functionCalls = response.functionCalls;

            if (functionCalls && functionCalls.length > 0) {
                 for (const call of functionCalls) {
                    if (call.name === 'generateCourseContent') {
                        const { topic } = call.args;
                        setMessages(prev => [...prev, { sender: 'assistant', text: `Gerando conteúdo sobre "${topic}"...` }]);
                        
                        const genResponse = await ai.models.generateContent({
                            model: modelName,
                            contents: `Gere uma lição em HTML simples e um exemplo de código JavaScript relacionado para o tópico: "${topic}". Retorne a resposta como um objeto JSON com as chaves "html" e "js". O HTML deve ser bem estruturado e o JS deve ser um exemplo prático.`,
                            config: { responseMimeType: 'application/json' }
                        });
                        
                        const data = JSON.parse(genResponse.text);
                        setMessages(prev => [...prev, { sender: 'tool_result', text: `Aqui está o conteúdo sugerido sobre "${topic}":`, data: { type: 'content', ...data } }]);

                    } else if (call.name === 'generateExerciseQuestions') {
                        const { topic, count } = call.args;
                         setMessages(prev => [...prev, { sender: 'assistant', text: `Gerando ${count} exercícios sobre "${topic}"...` }]);
                        
                        const genResponse = await ai.models.generateContent({
                            model: modelName,
                            contents: `Gere ${count} exercícios com perguntas e respostas para o tópico: "${topic}". Retorne a resposta como um array JSON de objetos, onde cada objeto tem as chaves "question" e "answer".`,
                            config: { responseMimeType: 'application/json' }
                        });
                        
                        const data = JSON.parse(genResponse.text);
                        setMessages(prev => [...prev, { sender: 'tool_result', text: `Aqui estão ${count} exercícios sugeridos sobre "${topic}":`, data: { type: 'exercises', exercises: data } }]);
                    } else if (call.name === 'generateMultipleChoiceQuiz') {
                        const { topic, count } = call.args;
                        setMessages(prev => [...prev, { sender: 'assistant', text: `Gerando quiz de múltipla escolha sobre "${topic}"...` }]);

                        const genResponse = await ai.models.generateContent({
                            model: modelName,
                            contents: `Gere um quiz de múltipla escolha com ${count} questões sobre o tópico: "${topic}". Retorne a resposta como um array JSON de objetos. Cada objeto deve ter as chaves: "question" (string), "options" (um objeto com chaves "A", "B", "C", "D"), e "answer" (a chave da resposta correta, ex: "B").`,
                            config: { responseMimeType: 'application/json' }
                        });
                        
                        const data = JSON.parse(genResponse.text);
                        setMessages(prev => [...prev, { sender: 'tool_result', text: `Aqui está um quiz sugerido sobre "${topic}":`, data: { type: 'quiz', quiz: data } }]);
                    }
                }
            } else {
                const assistantResponse: Message = { sender: 'assistant', text: response.text };
                setMessages(prev => [...prev, assistantResponse]);
            }

        } catch (error) {
            console.error('Error with Admin Assistant:', error);
            setMessages(prev => [...prev, { sender: 'error', text: 'Ocorreu um erro ao gerar a resposta.' }]);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="dashboard-card admin-assistant-card">
            <h4>Assistente de Currículo</h4>
            <div className="chat-window" ref={chatWindowRef}>
                {messages.map((msg, index) => {
                    switch (msg.sender) {
                        case 'assistant':
                        case 'user':
                        case 'error':
                            return (
                                <div key={index} className={`chat-message ${msg.sender}`} dangerouslySetInnerHTML={{ __html: markdownToHtml(msg.text) }} />
                            );
                        case 'tool_result':
                            return (
                                <div key={index} className="chat-message tool-result-message">
                                    <p>{msg.text}</p>
                                    {msg.data.type === 'content' && (
                                        <div className="tool-content-preview">
                                            <h5>HTML Sugerido:</h5>
                                            <pre><code>{msg.data.html}</code></pre>
                                            <h5>JavaScript Sugerido:</h5>
                                            <pre><code>{msg.data.js}</code></pre>
                                            <button onClick={() => onApplyContent(msg.data.html, msg.data.js)}>Aplicar Conteúdo</button>
                                        </div>
                                    )}
                                    {msg.data.type === 'exercises' && (
                                         <div className="tool-content-preview">
                                             <h5>Exercícios Sugeridos:</h5>
                                             <ul>
                                                {msg.data.exercises.map((ex, i) => (
                                                    <li key={i}><strong>P:</strong> {ex.question} <br/> <strong>R:</strong> {ex.answer}</li>
                                                ))}
                                             </ul>
                                            <button onClick={() => onAddExercises(msg.data.exercises)}>Adicionar Exercícios</button>
                                        </div>
                                    )}
                                    {msg.data.type === 'quiz' && (
                                        <div className="tool-content-preview">
                                            <h5>Quiz de Múltipla Escolha Sugerido:</h5>
                                            <div className="quiz-preview-list">
                                                {msg.data.quiz.map((item, i) => (
                                                    <div key={i} className="quiz-preview-item">
                                                        <p><strong>{i + 1}. {item.question}</strong></p>
                                                        <ul className="quiz-options">
                                                            {Object.entries(item.options).map(([key, value]) => (
                                                                <li key={key} className={key === item.answer ? 'correct-answer' : ''}>
                                                                    <strong>{key}:</strong> {String(value)}
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    </div>
                                                ))}
                                            </div>
                                            <button onClick={() => handleAddQuizAsExercises(msg.data.quiz)}>Adicionar Quiz como Exercícios</button>
                                        </div>
                                    )}
                                </div>
                            );
                        default:
                            return null;
                    }
                })}
                 {isLoading && (
                    <div className="chat-message assistant">
                        <div className="loading-dots"><span></span><span></span><span></span></div>
                    </div>
                )}
            </div>
             <form className="chat-input-form" onSubmit={handleSendMessage}>
                <input type="text" value={userInput} onChange={(e) => setUserInput(e.target.value)} placeholder="Peça para criar conteúdo..." disabled={isLoading}/>
                <button type="submit" disabled={isLoading}>Enviar</button>
            </form>
        </div>
    );
};

const StatCard = ({ title, value, icon }) => (
    <div className="stat-card">
        <div className="stat-icon">{icon}</div>
        <div className="stat-info">
            <p>{title}</p>
            <span>{value}</span>
        </div>
    </div>
);

const UserManagement = ({ users, onAddUser, onDeleteUser }) => {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');

    const handleAddUser = (e) => {
        e.preventDefault();
        if (!name.trim() || !email.trim() || !password.trim()) return;
        onAddUser(name, email, password);
        setName('');
        setEmail('');
        setPassword('');
    };

    return (
        <div className="dashboard-card">
            <div className="management-section">
                <h3>Gerenciar Alunos</h3>
                <form onSubmit={handleAddUser} className="management-form">
                    <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Nome do Aluno" required />
                    <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email do Aluno" required />
                    <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Senha Padrão" required />
                    <button type="submit">Adicionar Aluno</button>
                </form>
                <table className="management-table">
                    <thead><tr><th>Nome</th><th>Email</th><th>Ações</th></tr></thead>
                    <tbody>
                        {users.filter(u => u.role === 'student').map(user => (
                            <tr key={user.id}>
                                <td>{user.name}</td>
                                <td>{user.email}</td>
                                <td><button className="delete-button" onClick={() => onDeleteUser(user.id)}>Remover</button></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

const CourseManagement = ({ courses, onAddCourse, onDeleteCourse, onUpdateCourse, modelName }) => {
    const [name, setName] = useState('');
    const [code, setCode] = useState('');
    const [teacher, setTeacher] = useState('');
    const [editingCourse, setEditingCourse] = useState(null);

    // State for the editor form
    const [htmlContent, setHtmlContent] = useState('');
    const [jsContent, setJsContent] = useState('');
    const [exercises, setExercises] = useState([]);
    
    // State for the new exercise form
    const [newQuestion, setNewQuestion] = useState('');
    const [newAnswer, setNewAnswer] = useState('');
    const [newExerciseType, setNewExerciseType] = useState('text_answer');
    const [newExerciseOptions, setNewExerciseOptions] = useState(['', '', '', '']);
    const [correctOptionIndex, setCorrectOptionIndex] = useState(0);


    useEffect(() => {
        if (editingCourse) {
            setHtmlContent(editingCourse.content.html || '');
            setJsContent(editingCourse.content.js || '');
            setExercises(editingCourse.exercises || []);
        }
    }, [editingCourse]);

    const handleAddCourse = (e) => {
        e.preventDefault();
        if (!name.trim() || !code.trim() || !teacher.trim()) return;
        onAddCourse(name, code, teacher);
        setName(''); setCode(''); setTeacher('');
    };
    
     const handleOptionChange = (index, value) => {
        const updatedOptions = [...newExerciseOptions];
        updatedOptions[index] = value;
        setNewExerciseOptions(updatedOptions);
    };

    const handleAddExercise = () => {
        if (!newQuestion.trim()) return;

        let newExercise;
        if (newExerciseType === 'text_answer') {
            if (!newAnswer.trim()) return;
            newExercise = { id: Date.now(), type: 'text_answer', question: newQuestion, answer: newAnswer };
        } else {
            const validOptions = newExerciseOptions.filter(opt => opt.trim() !== '');
            if (validOptions.length < 2 || !validOptions[correctOptionIndex] || validOptions[correctOptionIndex].trim() === '') {
                 alert("Exercícios de múltipla escolha precisam de pelo menos 2 opções e a opção correta não pode estar vazia.");
                return;
            }
            newExercise = {
                id: Date.now(),
                type: 'multiple_choice',
                question: newQuestion,
                options: newExerciseOptions.filter(opt => opt.trim() !== ''),
                answer: newExerciseOptions[correctOptionIndex]
            };
        }
        setExercises([...exercises, newExercise]);
        // Reset fields
        setNewQuestion('');
        setNewAnswer('');
        setNewExerciseOptions(['', '', '', '']);
        setCorrectOptionIndex(0);
    };
    
    const handleAddGeneratedExercises = (generatedExercises) => {
        const newExercises = generatedExercises.map(ex => ({ ...ex, id: Date.now() + Math.random() }));
        setExercises(prev => [...prev, ...newExercises]);
    };

    const handleRemoveExercise = (id) => {
        setExercises(exercises.filter(ex => ex.id !== id));
    };

    const handleSaveChanges = () => {
        const updatedCourse = {
            ...editingCourse,
            content: { html: htmlContent, js: jsContent },
            exercises: exercises
        };
        onUpdateCourse(updatedCourse);
        setEditingCourse(null);
    };

    if (editingCourse) {
        return (
            <div className="management-section course-editor-layout">
                <div className="course-editor-main">
                    <div className="course-editor-header">
                        <h3>Editando: {editingCourse.name}</h3>
                        <button onClick={() => setEditingCourse(null)} className="back-button">← Voltar</button>
                    </div>
                    <div className="editor-form-group">
                        <label htmlFor="htmlContent">Conteúdo HTML</label>
                        <textarea id="htmlContent" className="code-textarea" value={htmlContent} onChange={(e) => setHtmlContent(e.target.value)} rows={10} />
                    </div>
                    <div className="editor-form-group">
                        <label htmlFor="jsContent">Conteúdo JavaScript</label>
                        <textarea id="jsContent" className="code-textarea" value={jsContent} onChange={(e) => setJsContent(e.target.value)} rows={10} />
                    </div>
                    
                    <div className="exercises-section">
                        <h4>Exercícios</h4>
                        {exercises.length > 0 && (
                            <ul className="exercise-list">
                                {exercises.map((ex) => (
                                    <li key={ex.id} className="exercise-item">
                                        <div className="exercise-content">
                                            <strong>P:</strong> <pre className="exercise-text">{ex.question}</pre>
                                            <strong>R:</strong> <pre className="exercise-text">{ex.answer}</pre>
                                        </div>
                                        <button onClick={() => handleRemoveExercise(ex.id)} className="delete-button">Remover</button>
                                    </li>
                                ))}
                            </ul>
                        )}
                        <div className="add-exercise-form">
                            <select value={newExerciseType} onChange={(e) => setNewExerciseType(e.target.value)}>
                                <option value="text_answer">Resposta de Texto</option>
                                <option value="multiple_choice">Múltipla Escolha</option>
                            </select>
                            <input type="text" value={newQuestion} onChange={(e) => setNewQuestion(e.target.value)} placeholder="Nova Pergunta" />
                            
                            {newExerciseType === 'text_answer' ? (
                                <input type="text" value={newAnswer} onChange={(e) => setNewAnswer(e.target.value)} placeholder="Resposta Esperada" />
                            ) : (
                                <div className="multiple-choice-form">
                                    <p>Opções (marque a correta):</p>
                                    {newExerciseOptions.map((option, index) => (
                                        <div className="option-input-group" key={index}>
                                            <input
                                                type="radio"
                                                name="correct_option"
                                                checked={correctOptionIndex === index}
                                                onChange={() => setCorrectOptionIndex(index)}
                                            />
                                            <input
                                                type="text"
                                                value={option}
                                                onChange={(e) => handleOptionChange(index, e.target.value)}
                                                placeholder={`Opção ${index + 1}`}
                                            />
                                        </div>
                                    ))}
                                </div>
                            )}

                            <button onClick={handleAddExercise}>Adicionar Exercício</button>
                        </div>
                    </div>

                    <button onClick={handleSaveChanges} className="save-changes-button">Salvar Alterações</button>
                </div>

                <AdminAssistant 
                    courseName={editingCourse.name} 
                    modelName={modelName}
                    onApplyContent={(html, js) => {
                        setHtmlContent(html);
                        setJsContent(js);
                    }}
                    onAddExercises={handleAddGeneratedExercises}
                />
            </div>
        )
    }

    return (
        <div className="dashboard-card">
             <div className="management-section">
                <h3>Gerenciar Cursos</h3>
                <form onSubmit={handleAddCourse} className="management-form">
                    <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Nome do Curso" required />
                    <input type="text" value={code} onChange={e => setCode(e.target.value)} placeholder="Código" required />
                    <input type="text" value={teacher} onChange={e => setTeacher(e.target.value)} placeholder="Professor" required />
                    <button type="submit">Adicionar Curso</button>
                </form>
                <table className="management-table">
                    <thead><tr><th>Curso</th><th>Código</th><th>Professor</th><th>Ações</th></tr></thead>
                    <tbody>
                        {courses.map(course => (
                            <tr key={course.id}>
                                <td>{course.name}</td>
                                <td>{course.code}</td>
                                <td>{course.teacher}</td>
                                <td className="actions-cell">
                                    <button className="edit-button" onClick={() => setEditingCourse(course)}>Editar Conteúdo</button>
                                    <button className="delete-button" onClick={() => onDeleteCourse(course.id)}>Remover</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

const AnnouncementManagement = ({ onAddAnnouncement }) => {
    const [text, setText] = useState('');

    const handleAddAnnouncement = (e) => {
        e.preventDefault();
        if (!text.trim()) return;
        onAddAnnouncement(text);
        setText('');
    };

    return (
        <div className="dashboard-card">
             <div className="management-section">
                <h3>Publicar Comunicado</h3>
                <form onSubmit={handleAddAnnouncement} className="management-form">
                    <textarea value={text} onChange={e => setText(e.target.value)} placeholder="Escreva o comunicado..." required />
                    <button type="submit">Publicar</button>
                </form>
            </div>
        </div>
    );
};


const AdminDashboard = ({ appData }) => {
    const { users, courses, announcements } = appData;
    return (
        <main className="main-content admin-view">
            <div className="stats-grid">
                <StatCard title="Total de Alunos" value={users.filter(u => u.role === 'student').length} icon="👥" />
                <StatCard title="Total de Cursos" value={courses.length} icon="📚" />
                <StatCard title="Comunicados" value={announcements.length} icon="📢" />
            </div>
        </main>
    );
};

const Sidebar = ({ userRole, currentView, onNavigate, onLogout }) => {
    const studentNav = [
        { id: 'dashboard', label: 'Visão Geral', icon: '🏠' },
        { id: 'courses', label: 'Meus Cursos', icon: '📚' },
        { id: 'announcements', label: 'Comunicados', icon: '📢' },
        { id: 'assistant', label: 'Assistente', icon: '🤖' },
        { id: 'purchase', label: 'Comprar Créditos', icon: '💳' },
    ];

    const adminNav = [
        { id: 'dashboard', label: 'Visão Geral', icon: '🏠' },
        { id: 'students', label: 'Alunos', icon: '👥' },
        { id: 'courses', label: 'Cursos', icon: '📚' },
        { id: 'announcements', label: 'Comunicados', icon: '📢' },
    ];
    
    const navItems = userRole === 'admin' ? adminNav : studentNav;
    const baseView = currentView.split('/')[0];

    return (
        <aside className="sidebar">
            <div className="sidebar-header">
                <h2>Portal Acadêmico</h2>
            </div>
            <nav className="sidebar-nav">
                <ul className="nav-list">
                    {navItems.map(item => (
                        <li 
                            key={item.id} 
                            className={`nav-item ${baseView === item.id ? 'active' : ''}`}
                            onClick={() => onNavigate(item.id)}
                        >
                            <span className="nav-icon">{item.icon}</span>
                            <span className="nav-label">{item.label}</span>
                        </li>
                    ))}
                </ul>
            </nav>
            <div className="sidebar-footer">
                 <button className="logout-button" onClick={onLogout}>Sair</button>
            </div>
        </aside>
    );
};


const App = () => {
    const [users, setUsers] = useStickyState([
        { id: 1, name: 'Admin User', email: 'mantovani36@gmail.com', password: 'senha123', role: 'admin' },
        ...initialStudents
    ], 'users');
    const [courses, setCourses] = useStickyState(initialCourses, 'courses');
    const [announcements, setAnnouncements] = useStickyState(initialAnnouncements, 'announcements');
    const [currentUser, setCurrentUser] = useStickyState(null, 'currentUser');
    const [theme, setTheme] = useStickyState('light', 'theme');
    const [currentView, setCurrentView] = useStickyState('dashboard', 'currentView');
    const [selectedCourseId, setSelectedCourseId] = useState(null);

    useEffect(() => {
        document.body.setAttribute('data-theme', theme);
    }, [theme]);
    
    const toggleTheme = () => {
        setTheme(prevTheme => (prevTheme === 'light' ? 'dark' : 'light'));
    };


    const handleLogin = async (email, password) => {
        // Tenta autenticar na API
        try {
            const resp = await fetch(`${API_BASE}/api/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });
            if (!resp.ok) throw new Error('Email ou senha inválidos.');
            const data = await resp.json();
            try { localStorage.setItem('authToken', data.token); } catch {}
            const deriveName = (e) => {
                const local = (e || '').split('@')[0] || 'Usuário';
                return local.charAt(0).toUpperCase() + local.slice(1);
            };
            const resolvedUser = { id: data.user.id, name: data.user.name || deriveName(data.user.email), email: data.user.email, role: data.user.role, credits: data.user.credits ?? 0 };
            setCurrentUser(resolvedUser);
            setCurrentView('dashboard');
            setSelectedCourseId(null);
            return;
        } catch (err) {
            // fallback para autenticação local caso API indisponível
            const user = users.find(u => u.email === email && u.password === password);
            if (user) {
                setCurrentUser(user);
                setCurrentView('dashboard');
                setSelectedCourseId(null);
                return;
            }
            throw err instanceof Error ? err : new Error('Falha ao autenticar');
        }
    };

    const handleSignUp = async (name, email, password) => {
        // Tenta cadastrar na API; em caso de falha, registra localmente
        try {
            const resp = await fetch(`${API_BASE}/api/signup`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, email, password })
            });
            if (!resp.ok) {
                const msg = resp.status === 409 ? 'Este email já está cadastrado.' : 'Falha ao cadastrar.';
                throw new Error(msg);
            }
            const data = await resp.json();
            const created = { id: data.id, name: data.name, email: data.email, role: data.role, credits: data.credits ?? APP_CONFIG.newUserStartingCredits };
            setCurrentUser(created);
            setCurrentView('dashboard');
            setSelectedCourseId(null);
            return;
        } catch (err) {
            const userExists = users.find(u => u.email === email);
            if (userExists) throw err instanceof Error ? err : new Error('Este email já está cadastrado.');
            const newUser = {
                id: Date.now(),
                name,
                email,
                password,
                role: 'student',
                credits: APP_CONFIG.newUserStartingCredits,
            };
            setUsers(prevUsers => [...prevUsers, newUser]);
            setCurrentUser(newUser);
            setCurrentView('dashboard');
            setSelectedCourseId(null);
        }
    };

    const handleLogout = () => {
        setCurrentUser(null);
        localStorage.removeItem('currentView');
        localStorage.removeItem('currentUser');
        localStorage.removeItem('authToken');
    };
    
    const handlePurchase = async (pkg) => {
        try {
            if (!currentUser) throw new Error('Você precisa estar logado.');
            // Map pack by credits (must match server validation)
            const pack = String(pkg.credits);
            const resp = await fetch(`${API_BASE}/api/payments/create-checkout`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pack, userId: currentUser.id })
            });
            const data = await resp.json();
            if (!resp.ok || !data.url) throw new Error(data.error || 'Falha ao iniciar pagamento');
            window.location.href = data.url;
        } catch (e) {
            alert((e && e.message) || 'Erro ao redirecionar para pagamento.');
        }
    };

    // After redirect back from Stripe success, refresh user credits
    useEffect(() => {
        try {
            const params = new URLSearchParams(window.location.search);
            if (params.get('checkout') === 'success' && currentUser?.id) {
                fetch(`${API_BASE}/api/users/${currentUser.id}`)
                    .then(r => r.ok ? r.json() : null)
                    .then(data => {
                        if (data && typeof data.credits === 'number') {
                            setCurrentUser(prev => prev ? { ...prev, credits: data.credits } : prev);
                        }
                    })
                    .catch(() => {});
            }
        } catch {}
    }, [currentUser?.id]);

    const handleUseCredit = () => {
        const cost = APP_CONFIG.assistantCreditCost;
        if (currentUser && currentUser.credits >= cost) {
            const updatedUser = { ...currentUser, credits: currentUser.credits - cost };
            setCurrentUser(updatedUser);
            setUsers(prevUsers => prevUsers.map(user =>
                user.id === currentUser.id ? updatedUser : user
            ));
        }
    };

    const handleNavigate = (view, id = null) => {
        if (view === 'course-detail' && id) {
            setSelectedCourseId(id);
            setCurrentView(`courses/${id}`);
        } else {
            setSelectedCourseId(null);
            setCurrentView(view);
        }
    };

    // --- Admin Handlers --- //
    const addUser = (name, email, password) => {
        const newUser = { id: Date.now(), name, email, password, role: 'student', credits: 0 };
        setUsers(prev => [...prev, newUser]);
    };
    const deleteUser = (id) => {
        setUsers(prev => prev.filter(user => user.id !== id));
    };
    const addCourse = (name, code, teacher) => {
        const newCourse = { id: Date.now(), name, code, teacher, content: { html: '', js: '' }, exercises: [] };
        setCourses(prev => [...prev, newCourse]);
    };
    const deleteCourse = (id) => {
        setCourses(prev => prev.filter(course => course.id !== id));
    };
    const updateCourse = (updatedCourse) => {
        setCourses(prev => prev.map(course => course.id === updatedCourse.id ? updatedCourse : course));
    };
    const addAnnouncement = (text) => {
        const date = new Date().toISOString().slice(0, 10);
        const newAnnouncement = { id: Date.now(), text, date };
        setAnnouncements(prev => [newAnnouncement, ...prev]);
    };

    const renderContent = () => {
        const view = currentView.split('/')[0];
        
        if (currentUser.role === 'student') {
            switch (view) {
                case 'dashboard':
                    return <StudentDashboard courses={courses} announcements={announcements} onCourseClick={(id) => handleNavigate('course-detail', id)} />;
                case 'courses':
                    const selectedCourse = courses.find(c => c.id === selectedCourseId);
                    return <CourseDetailView course={selectedCourse} />;
                case 'announcements':
                    return <div className="main-content"><Announcements announcements={announcements} /></div>;
                case 'assistant':
                     return <div className="main-content"><AcademicAssistant credits={currentUser.credits || 0} onUseCredit={handleUseCredit} modelName={APP_CONFIG.geminiModel} /></div>;
                case 'purchase':
                    return <div className="main-content"><PurchaseGadgets onPurchase={handlePurchase} packages={APP_CONFIG.creditPackages} /></div>;
                default:
                    return <StudentDashboard courses={courses} announcements={announcements} onCourseClick={(id) => handleNavigate('course-detail', id)} />;
            }
        }
        
        if (currentUser.role === 'admin') {
            const appData = { users, courses, announcements };
            const handlers = { addUser, deleteUser, addCourse, deleteCourse, updateCourse, addAnnouncement };
            switch (view) {
                case 'dashboard':
                    return <AdminDashboard appData={appData} />;
                case 'students':
                    return <main className="main-content"><UserManagement users={users} onAddUser={handlers.addUser} onDeleteUser={handlers.deleteUser} /></main>;
                case 'courses':
                    return <main className="main-content"><CourseManagement courses={courses} onAddCourse={handlers.addCourse} onDeleteCourse={handlers.deleteCourse} onUpdateCourse={handlers.updateCourse} modelName={APP_CONFIG.geminiModel} /></main>;
                case 'announcements':
                    return <main className="main-content"><AnnouncementManagement onAddAnnouncement={handlers.addAnnouncement} /></main>;
                default:
                    return <AdminDashboard appData={appData} />;
            }
        }
        return null;
    };


    if (!currentUser) {
        return <AuthForm onLogin={handleLogin} onSignUp={handleSignUp} theme={theme} toggleTheme={toggleTheme} />;
    }

    return (
        <div className="app-container">
            <Sidebar 
                userRole={currentUser.role} 
                currentView={currentView}
                onNavigate={handleNavigate}
                onLogout={handleLogout}
            />
            <div className="content-area">
                 <header className="header">
                  <h1>
                    {currentUser.role === 'student' ? "Portal do Aluno" : "Painel do Administrador"}
                    <span className="user-name">| {currentUser.name} • {currentUser.email}</span>
                  </h1>
                  <div className="header-controls">
                    {currentUser.role === 'student' && <div className="user-credits">Saldo: <strong>{currentUser.credits || 0}</strong> créditos</div>}
                    <ThemeToggler theme={theme} toggleTheme={toggleTheme} />
                  </div>
                </header>
                {renderContent()}
            </div>
        </div>
    );
};

const container = document.getElementById('root');
const root = createRoot(container!);
root.render(<App />);
