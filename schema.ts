import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// 1. Tabla de Configuración del Agente (El "Alma")
export const agentConfigs = pgTable("agent_configs", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(), // Aquí se guardará "wallet_data"
  value: text("value").notNull(),      // Aquí el JSON de la wallet
  updatedAt: timestamp("updated_at").defaultNow(),
});

// 2. Tus tablas de Chat (Para que no se borren)
export const conversations = pgTable("conversations", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").notNull(),
  role: text("role").notNull(), // "user" o "assistant"
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Esquemas de inserción
export const insertAgentConfigSchema = createInsertSchema(agentConfigs);
export const insertConversationSchema = createInsertSchema(conversations);
export const insertMessageSchema = createInsertSchema(messages);

// Tipos
export type AgentConfig = typeof agentConfigs.$inferSelect;
export type Conversation = typeof conversations.$inferSelect;
export type Message = typeof messages.$inferSelect;

