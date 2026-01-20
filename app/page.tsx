/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Mic, Send, Languages, Copy, Volume2, 
  StopCircle, Menu, Plus, MessageSquare, Trash2, X, Check 
} from "lucide-react";

// --- Types ---
type Message = {
  id: string;
  role: "user" | "assistant";
  text: string;
  langLabel: string; // For display (e.g., "French")
  langCode: string;  // For TTS (e.g., "fr-FR")
};

type ChatSession = {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
};

// --- Language Options ---
const LANGUAGES = [
  { code: "en-US", name: "English", label: "English" },
  { code: "es-ES", name: "Spanish", label: "Español" },
  { code: "fr-FR", name: "French", label: "Français" },
  { code: "de-DE", name: "German", label: "Deutsch" },
  { code: "zh-CN", name: "Chinese", label: "中文" },
  { code: "hi-IN", name: "Hindi", label: "हिन्दी" },
  { code: "ar-SA", name: "Arabic", label: "العربية" },
];

export default function TranslatorPage() {
  // --- Global State ---
  const [chats, setChats] = useState<ChatSession[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // --- Current Chat State ---
  const [inputText, setInputText] = useState("");
  const [isTranslating, setIsTranslating] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null); // Track copied message
  
  // Language State
  const [sourceLang, setSourceLang] = useState("en-US");
  const [targetLang, setTargetLang] = useState("fr-FR");
  
  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  // --- 1. Load/Save from LocalStorage ---
  useEffect(() => {
    const saved = localStorage.getItem("translation-chats");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setChats(parsed);
        if (parsed.length > 0) {
          setCurrentChatId(parsed[0].id);
        }
      } catch (e) {
        console.error("Failed to load chats", e);
      }
    }
  }, []);

  useEffect(() => {
    if (chats.length > 0 || (chats.length === 0 && localStorage.getItem("translation-chats"))) {
      localStorage.setItem("translation-chats", JSON.stringify(chats));
    }
  }, [chats]);

  // --- 2. Chat Management Helpers ---
  const getCurrentChat = () => chats.find(c => c.id === currentChatId);
  
  const createNewChat = () => {
    // Prevent duplicate empty chats
    if (chats.length > 0) {
      const mostRecent = chats[0];
      if (mostRecent.messages.length === 0) {
        setCurrentChatId(mostRecent.id);
        setIsSidebarOpen(false);
        return mostRecent.id;
      }
    }

    const newChat: ChatSession = {
      id: Date.now().toString(),
      title: "New Translation",
      messages: [],
      createdAt: Date.now(),
    };
    setChats(prev => [newChat, ...prev]);
    setCurrentChatId(newChat.id);
    setIsSidebarOpen(false); 
    return newChat.id;
  };

  const deleteChat = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newChats = chats.filter(c => c.id !== id);
    setChats(newChats);
    
    if (currentChatId === id) {
      setCurrentChatId(newChats.length > 0 ? newChats[0].id : null);
    }
  };

  // --- 3. Speech & Copy Logic ---
  const toggleListening = () => {
    if (isListening) {
        recognitionRef.current?.stop();
        setIsListening(false);
        return;
    }
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return alert("Browser not supported for Voice Input.");
    
    const recognition = new SpeechRecognition();
    recognition.lang = sourceLang;
    recognition.continuous = false;
    
    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onerror = (e: any) => {
        console.error("Speech error", e);
        setIsListening(false);
    };
    
    recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setInputText(prev => (prev ? prev + " " + transcript : transcript));
    };
    recognitionRef.current = recognition;
    recognition.start();
  };

  const handleSpeak = (text: string, langCode: string) => {
    if (!window.speechSynthesis) return;
    
    window.speechSynthesis.cancel(); // Stop any previous speech
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = langCode; // Uses the exact code saved in the message
    utterance.rate = 0.9; // Slightly slower for better clarity
    window.speechSynthesis.speak(utterance);
  };

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // --- 4. Core Translation Logic ---
  const handleTranslate = async () => {
    if (!inputText.trim()) return;

    let activeChatId = currentChatId;
    if (!activeChatId) {
      activeChatId = createNewChat();
    }

    const currentText = inputText;
    const sourceObj = LANGUAGES.find(l => l.code === sourceLang) || LANGUAGES[0];
    const targetObj = LANGUAGES.find(l => l.code === targetLang) || LANGUAGES[1];

    // 1. Add User Message
    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      text: currentText,
      langLabel: sourceObj.label,
      langCode: sourceObj.code,
    };

    setChats(prev => prev.map(chat => {
      if (chat.id === activeChatId) {
        const newTitle = chat.messages.length === 0 ? currentText.slice(0, 30) + "..." : chat.title;
        return { ...chat, title: newTitle, messages: [...chat.messages, userMsg] };
      }
      return chat;
    }));

    setInputText("");
    setIsTranslating(true);

    try {
      // 2. Call API
      const response = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: currentText,
          targetLang: targetLang, 
          sourceLang: sourceLang, 
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Translation request failed");

      // 3. Add AI Response
      const aiMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        text: data.translatedText,
        langLabel: targetObj.label,
        langCode: targetObj.code,
      };

      setChats(prev => prev.map(chat => {
        if (chat.id === activeChatId) {
          return { ...chat, messages: [...chat.messages, aiMsg] };
        }
        return chat;
      }));

    } catch (error: any) {
      console.error("Translation failed:", error);
      const errorMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        text: "⚠️ Error: Could not translate. The free API might be busy.",
        langLabel: "System",
        langCode: "en-US",
      };
      setChats(prev => prev.map(chat => {
        if (chat.id === activeChatId) {
          return { ...chat, messages: [...chat.messages, errorMsg] };
        }
        return chat;
      }));
    } finally {
      setIsTranslating(false);
    }
  };

  // --- Render Helpers ---
  const activeMessages = getCurrentChat()?.messages || [];
  const hasMessages = activeMessages.length > 0;

  return (
    <div className="h-dvh w-full bg-neutral-950 text-white overflow-hidden flex font-sans">
      
      {/* --- SIDEBAR --- */}
      <AnimatePresence>
        {(isSidebarOpen || (typeof window !== 'undefined' && window.innerWidth >= 1024)) && (
          <motion.aside
            initial={{ x: -300, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -300, opacity: 0 }}
            className={`
              absolute lg:relative z-40 h-full w-[280px] bg-black/80 backdrop-blur-xl border-r border-white/10 flex flex-col
              ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
            `}
          >
            <div className="p-4">
              <button 
                onClick={createNewChat}
                className="w-full flex items-center gap-3 bg-white/5 hover:bg-white/10 border border-white/10 p-3 rounded-xl transition-all text-sm font-medium hover:border-purple-500/30"
              >
                <Plus size={18} className="text-purple-400" />
                <span>New Translation</span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-2 space-y-1 scrollbar-hide">
              {chats.map(chat => (
                <div 
                  key={chat.id}
                  onClick={() => { setCurrentChatId(chat.id); setIsSidebarOpen(false); }}
                  className={`group relative flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                    currentChatId === chat.id ? "bg-white/10 text-white" : "text-white/50 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  <MessageSquare size={16} className={currentChatId === chat.id ? "text-purple-400" : ""} />
                  <span className="text-sm truncate w-[160px]">{chat.title}</span>
                  <button 
                    onClick={(e) => deleteChat(chat.id, e)}
                    className={`absolute right-2 p-1.5 rounded-md transition-all ${
                        currentChatId === chat.id ? "opacity-100 hover:bg-red-500/20 hover:text-red-400" : "opacity-0 group-hover:opacity-100 hover:bg-white/10"
                    }`}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              {chats.length === 0 && (
                <div className="text-center text-white/20 text-xs mt-10">No history yet</div>
              )}
            </div>
            <button onClick={() => setIsSidebarOpen(false)} className="lg:hidden absolute top-4 right-[-45px] p-2 bg-neutral-800 rounded-r-lg text-white/50 border border-l-0 border-white/10">
              <X size={20} />
            </button>
          </motion.aside>
        )}
      </AnimatePresence>
      
      {isSidebarOpen && <div onClick={() => setIsSidebarOpen(false)} className="fixed inset-0 bg-black/60 z-30 lg:hidden backdrop-blur-sm" />}

      {/* --- MAIN CONTENT --- */}
      <main className="flex-1 flex flex-col relative w-full h-full bg-gradient-to-br from-neutral-900 via-neutral-950 to-black">
        
        {/* Background Blobs */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
           <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-purple-600/10 rounded-full blur-[100px] animate-blob" />
           <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] bg-blue-600/10 rounded-full blur-[100px] animate-blob animation-delay-2000" />
        </div>

        {/* Header */}
        <header className="flex-none flex justify-between items-center p-4 border-b border-white/5 z-20">
          <div className="flex items-center gap-3">
            <button onClick={() => setIsSidebarOpen(true)} className="lg:hidden p-2 hover:bg-white/10 rounded-lg text-white/70">
              <Menu size={20} />
            </button>
            <div className="flex items-center gap-2">
               <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center shadow-lg shadow-purple-500/20">
                  <Languages size={16} className="text-white" />
               </div>
               <span className="font-semibold tracking-wide hidden sm:inline">AI Translator</span>
            </div>
          </div>
          <button onClick={createNewChat} className="p-2 hover:bg-white/10 rounded-full text-white/50 hover:text-white">
             <Plus size={20} />
          </button>
        </header>

        {/* Chat Area */}
        <div 
            ref={chatContainerRef}
            className={`flex-1 overflow-y-auto space-y-6 p-4 sm:p-6 scrollbar-hide z-10 transition-opacity duration-500 ${hasMessages ? 'opacity-100' : 'opacity-0'}`}
        >
          {activeMessages.map((msg) => (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              key={msg.id}
              className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}
            >
              <span className="text-[10px] uppercase tracking-wider mb-1 px-1 text-white/40">{msg.langLabel}</span>
              <div className={`relative max-w-[90%] md:max-w-[70%] p-4 rounded-2xl backdrop-blur-md border shadow-xl ${
                msg.role === "user" ? "bg-white/10 border-white/10 rounded-br-none text-white" : "bg-black/40 border-white/5 rounded-bl-none text-gray-100"
              }`}>
                <p className="whitespace-pre-wrap leading-relaxed">{msg.text}</p>
                {msg.role === "assistant" && msg.langLabel !== "System" && (
                  <div className="flex gap-3 mt-3 pt-3 border-t border-white/5 justify-end">
                     
                     {/* SPEAK BUTTON */}
                     {/* <button 
                        onClick={() => handleSpeak(msg.text, msg.langCode)} 
                        className="text-white/40 hover:text-purple-400 transition-colors"
                        title="Listen"
                     >
                        <Volume2 size={16} />
                     </button> */}

                     {/* COPY BUTTON */}
                     <button 
                        onClick={() => handleCopy(msg.id, msg.text)} 
                        className={`transition-all ${copiedId === msg.id ? "text-green-400" : "text-white/40 hover:text-blue-400"}`}
                        title="Copy"
                     >
                        {copiedId === msg.id ? <Check size={16} /> : <Copy size={16} />}
                     </button>
                  </div>
                )}
              </div>
            </motion.div>
          ))}
          
          {isTranslating && (
             <div className="flex items-start">
               <div className="bg-black/40 border border-white/5 p-4 rounded-2xl rounded-bl-none flex gap-2">
                 <div className="w-1.5 h-1.5 bg-purple-500 rounded-full animate-bounce" />
                 <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce delay-100" />
                 <div className="w-1.5 h-1.5 bg-purple-500 rounded-full animate-bounce delay-200" />
               </div>
             </div>
          )}
          <div ref={messagesEndRef} className="h-4" />
        </div>

        {/* Hero */}
        {!hasMessages && !isTranslating && (
           <div className="absolute inset-0 flex flex-col items-center justify-center text-center z-0 p-6 pb-32">
              <div className="p-6 rounded-full bg-white/5 border border-white/5 mb-6 animate-pulse">
                  <Languages size={48} className="text-white/20" />
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">How can I help you translate?</h2>
              <p className="text-white/40 max-w-md">Select your languages below and start typing or speaking.</p>
           </div>
        )}

        {/* Input */}
        <div className="flex-none p-4 w-full max-w-4xl mx-auto z-20">
            <motion.div layout className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-[24px] p-2 flex flex-col gap-2 shadow-2xl">
                <div className="flex justify-between px-3 pt-1">
                    <select value={sourceLang} onChange={e => setSourceLang(e.target.value)} className="bg-transparent text-xs font-bold text-purple-400 uppercase outline-none cursor-pointer">
                        {LANGUAGES.map(l => <option key={l.code} value={l.code} className="bg-neutral-900">{l.name}</option>)}
                    </select>
                    <span className="text-white/20">→</span>
                    <select value={targetLang} onChange={e => setTargetLang(e.target.value)} className="bg-transparent text-xs font-bold text-blue-400 uppercase outline-none cursor-pointer text-right">
                        {LANGUAGES.map(l => <option key={l.code} value={l.code} className="bg-neutral-900">{l.name}</option>)}
                    </select>
                </div>

                <div className="flex items-end gap-2 bg-black/20 rounded-[20px] p-1.5 border border-white/5 relative">
                    <button onClick={toggleListening} className={`p-3 rounded-full transition-all ${isListening ? 'bg-red-500 text-white animate-pulse' : 'text-white/50 hover:bg-white/10'}`}>
                        {isListening ? <StopCircle size={20} /> : <Mic size={20} />}
                    </button>
                    <textarea
                        value={inputText}
                        onChange={e => setInputText(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleTranslate())}
                        placeholder={isListening ? "Listening..." : "Type a message..."}
                        className="flex-1 bg-transparent outline-none text-white placeholder-white/20 resize-none py-3 max-h-32 min-h-[44px]"
                        rows={1}
                    />
                    <button onClick={handleTranslate} disabled={!inputText.trim() || isTranslating} className={`p-3 rounded-full transition-all ${inputText.trim() ? "bg-blue-600 text-white shadow-lg" : "bg-white/5 text-white/20"}`}>
                        <Send size={18} />
                    </button>
                </div>
            </motion.div>
            
            {/* --- ATTRIBUTION FOOTER --- */}
            <div className="mt-4 text-center">
              <p className="text-[10px] text-white/20">
                Made by <span className="text-white/40 font-medium tracking-wide">Atilola Emmanuel Oluwatoba</span>
              </p>
            </div>
            
        </div>

      </main>
    </div>
  );
}