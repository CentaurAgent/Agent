import { sql } from "drizzle-orm";
import {
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export const conversations = pgTable("conversations", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id")
    .notNull()
    .references(() => conversations.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertConversationSchema = createInsertSchema(conversations).omit({
  id: true,
  createdAt: true,
});

export const insertMessageSchema = createInsertSchema(messages).omit({
  id: true,
  createdAt: true,
});

export type Conversation = typeof conversations.$inferSelect;
export type InsertConversation = z.infer<typeof insertConversationSchema>;
export type Message = typeof messages.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;

export type CreateConversationRequest = InsertConversation;
export type ConversationResponse = Conversation;
export type ConversationsListResponse = Conversation[];

export type CreateMessageRequest = InsertMessage;
export type MessageResponse = Message;
export type MessagesListResponse = Message[];

export type CreateTextMessageRequest = {
  content: string;
};

export type Voice = "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer";

export type CreateVoiceMessageRequest = {
  audio: string;
  voice?: Voice;
};

export const VOICES = [
  "alloy",
  "echo",
  "fable",
  "onyx",
  "nova",
  "shimmer",
] as const;

export interface ApiErrorResponse {
  message: string;
  field?: string;
}
// Add this below your 'messages' table definition
export const agentConfigs = pgTable("agent_configs", {
  key: varchar("key").primaryKey(), // We will use 'wallet_data' as the key
  value: text("value").notNull(),   // This stores the encrypted wallet string
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// Add this at the bottom for type safety
export type AgentConfig = typeof agentConfigs.$inferSelect;
