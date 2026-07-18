import { useState, useRef, useCallback, useEffect } from 'react';

// SpeechRecognition (a interface do reconhecedor) e window.SpeechRecognition
// não estão em lib.dom.d.ts neste tsconfig — apenas SpeechRecognitionEvent existe.
// Declaração mínima para evitar erros de tipo sem lib custom nem `any`.
interface SpeechRecognitionLike {
  lang:            string;
  interimResults:  boolean;
  maxAlternatives: number;
  continuous:      boolean;
  onresult:        ((event: SpeechRecognitionEvent) => void) | null;
  onerror:         (() => void) | null;
  onend:           (() => void) | null;
  start():         void;
  stop():          void;
}

type SpeechRecognitionCtorType = new () => SpeechRecognitionLike;

declare global {
  interface Window {
    SpeechRecognition?:       SpeechRecognitionCtorType;
    webkitSpeechRecognition?: SpeechRecognitionCtorType;
  }
}

interface UseSpeechRecognitionReturn {
  isListening: boolean;
  isSupported: boolean;
  startListening: () => void;
  stopListening: () => void;
}

export function useSpeechRecognition(
  onResult: (transcript: string) => void,
): UseSpeechRecognitionReturn {
  const [isListening, setIsListening] = useState(false);

  const isSupported = typeof window !== 'undefined' &&
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const onResultRef    = useRef(onResult);

  // Mantém ref atualizada sem re-criar handlers
  useEffect(() => { onResultRef.current = onResult; }, [onResult]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setIsListening(false);
  }, []);

  const startListening = useCallback(() => {
    if (!isSupported) return;

    const SpeechRecognitionCtor =
      window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) return;

    const recognition = new SpeechRecognitionCtor();
    recognition.lang             = 'pt-BR';
    recognition.interimResults   = false;
    recognition.maxAlternatives  = 1;
    recognition.continuous       = false;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = event.results[0]?.[0]?.transcript ?? '';
      if (transcript) onResultRef.current(transcript);
      setIsListening(false);
    };

    recognition.onerror = () => setIsListening(false);
    recognition.onend   = () => setIsListening(false);

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }, [isSupported]);

  // Cleanup na desmontagem
  useEffect(() => () => { recognitionRef.current?.stop(); }, []);

  return { isListening, isSupported, startListening, stopListening };
}
