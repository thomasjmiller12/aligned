"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageCircle, Send, X } from "lucide-react";
import { Button } from "@/components/ui/Button";

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
        <div className="fixed bottom-5 right-5 z-40">
          <Button
            onClick={() => setIsOpen(true)}
            variant="primary"
            aria-label="Open chat"
            className="rounded-full"
            size="iconLg"
            round
          >
            <MessageCircle className="h-6 w-6" />
          </Button>
          {unreadCount > 0 && (
            <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-sun px-1 text-xs font-bold text-abyss">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </div>
      )}

      {/* Chat panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="panel fixed bottom-5 right-5 z-40 flex max-h-[60vh] w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-2xl sm:w-80"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3">
              <h3 className="text-sm font-semibold text-foam">Chat</h3>
              <Button
                variant="ghost"
                onClick={() => setIsOpen(false)}
                aria-label="Close chat"
                size="icon"
                round
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="rule-caustic" />

            {/* Messages */}
            <div
              className="flex flex-1 flex-col gap-1.5 overflow-y-auto px-3 py-2"
              role="log"
              aria-live="polite"
            >
              {messages.length === 0 && (
                <p className="py-8 text-center text-sm text-silt">
                  No messages yet
                </p>
              )}
              {messages.map((msg, i) => (
                <div
                  key={msg._id}
                  className={`flex items-start gap-2 rounded-xl px-1.5 py-1 ${
                    i % 2 === 1 ? "bg-foam/[0.03]" : ""
                  }`}
                >
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
                    <p className="text-sm leading-snug text-foam">{msg.body}</p>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="rule-caustic" />
            <div className="flex items-center gap-2 px-3 py-2">
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
                className="flex-1 rounded-xl border border-caustic/20 bg-abyss/40 px-3 py-2 text-sm text-foam outline-none placeholder:text-silt/50 focus:ring-2 focus:ring-caustic/40"
              />
              <Button
                variant="secondary"
                onClick={handleSend}
                disabled={!input.trim()}
                aria-label="Send message"
                size="icon"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
