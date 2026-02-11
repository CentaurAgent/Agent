import { db } from "./db";
import { conversations, messages, agentConfigs } from "@shared/schema";
import { desc, eq } from "drizzle-orm";

export interface IStorage {
  // Funciones del Chat
  getConversation(id: number): Promise<typeof conversations.$inferSelect | undefined>;
  getConversations(): Promise<(typeof conversations.$inferSelect)[]>;
  createConversation(title: string): Promise<typeof conversations.$inferSelect>;
  deleteConversation(id: number): Promise<void>;
  getMessages(conversationId: number): Promise<(typeof messages.$inferSelect)[]>;
  createMessage(
    conversationId: number,
    role: "user" | "assistant",
    content: string,
  ): Promise<typeof messages.$inferSelect>;
  
  // Funciones de la Billetera (Persistencia)
  getWallet(): Promise<string | null>;
  saveWallet(data: string): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  // --- Persistencia del Wallet ---
  async getWallet() {
    const [config] = await db
      .select()
      .from(agentConfigs)
      .where(eq(agentConfigs.key, "wallet_data"));
    return config?.value ?? null;
  }

  async saveWallet(data: string) {
    await db
      .insert(agentConfigs)
      .values({ key: "wallet_data", value: data })
      .onConflictDoUpdate({
        target: agentConfigs.key,
        set: { value: data, updatedAt: new Date() },
      });
  }

  // --- Sistema de Chat ---
  async getConversation(id: number) {
    const [conversation] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, id));
    return conversation;
  }

  async getConversations() {
    return db.select().from(conversations).orderBy(desc(conversations.createdAt));
  }

  async createConversation(title: string) {
    const [conversation] = await db
      .insert(conversations)
      .values({ title })
      .returning();
    return conversation;
  }

  async deleteConversation(id: number) {
    await db.delete(messages).where(eq(messages.conversationId, id));
    await db.delete(conversations).where(eq(conversations.id, id));
  }

  async getMessages(conversationId: number) {
    return db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(messages.createdAt);
  }

  async createMessage(conversationId: number, role: "user" | "assistant", content: string) {
    const [message] = await db
      .insert(messages)
      .values({ conversationId, role, content })
      .returning();
    return message;
  }
}

export const storage = new DatabaseStorage();

