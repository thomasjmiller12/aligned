"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageCircle, Send, X } from "lucide-react";

export default function ChatPanel({
  gameId,
  sessionId,
  myPlayerId,
}: {
  gameId: Id<"games">;
  sessionId: string;
  myPlayerId: Id<"players">;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [lastSeenCount, setLastSeenCount] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const messages = useQuery(api.messages.getMessages, { gameId }) ?? [];
  const sendMessage = useMutation(api.messages.sendMessage);

  const unreadCount = isOpen ? 0 : Math.max(0, messages.length - lastSeenCount);

  useEffect(() => {
    if (isOpen && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages.length, isOpen]);

  useEffect(() => {
    if (isOpen) {
      setLastSeenCount(messages.length);
      inputRef.current?.focus();
    }
  }, [isOpen, messages.length]);

  const handleSend = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    setInput("");
    try {
      await sendMessage({ gameId, sessionId, body: trimmed });
    } catch {
      // Message won't appear if send fails
    }
  }, [input, gameId, sessionId, sendMessage]);

  return (
    <>
      {/* Floating chat button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-5 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-accent shadow-lg transition-all hover:bg-accent/90 active:scale-90"
          aria-label="Open chat"
        >
          <MessageCircle className="h-6 w-6 text-white" />
          {unreadCount > 0 && (
            <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-xs font-bold text-white">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
      )}

      {/* Chat panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed bottom-5 right-5 z-40 flex max-h-[60vh] w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-2xl border border-white/50 bg-white/80 shadow-xl backdrop-blur-md sm:w-80"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-gray-200/50 px-4 py-3">
              <h3 className="text-sm font-semibold text-text">Chat</h3>
              <button
                onClick={() => setIsOpen(false)}
                className="rounded-full p-1 text-text-secondary transition-colors hover:bg-black/5"
                aria-label="Close chat"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Messages */}
            <div
              className="flex flex-1 flex-col gap-1.5 overflow-y-auto px-3 py-2"
              role="log"
              aria-live="polite"
            >
              {messages.length === 0 && (
                <p className="py-8 text-center text-sm text-text-secondary">
                  No messages yet
                </p>
              )}
              {messages.map((msg) => (
                <div key={msg._id} className="flex items-start gap-2">
                  <span
                    className="mt-1.5 h-2.5 w-2.5 flex-shrink-0 rounded-full"
                    style={{ backgroundColor: msg.playerColor }}
                  />
                  <div className="min-w-0">
                    <span
                      className="text-xs font-semibold"
                      style={{ color: msg.playerColor }}
                    >
                      {msg.playerId === myPlayerId ? "You" : msg.playerName}
                    </span>
                    <p className="text-sm leading-snug text-text">{msg.body}</p>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="flex items-center gap-2 border-t border-gray-200/50 px-3 py-2">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Type a message..."
                maxLength={200}
                className="flex-1 rounded-lg bg-black/5 px-3 py-2 text-sm outline-none placeholder:text-text-secondary/50 focus:ring-2 focus:ring-accent/20"
              />
              <button
                onClick={handleSend}
                disabled={!input.trim()}
                className="rounded-lg p-2 text-accent transition-colors hover:bg-accent/10 disabled:opacity-30"
                aria-label="Send message"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
