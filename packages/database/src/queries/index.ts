import { desc, eq } from "drizzle-orm";

import { db } from "../index";
import { posts } from "../schema";

// Posts queries
export const postQueries = {
  getAll: () => db.query.posts.findMany({ orderBy: [desc(posts.createdAt)] }),

  getById: (id: number) =>
    db.query.posts.findFirst({ where: eq(posts.id, id) }),

  getLatest: () =>
    db.query.posts.findFirst({ orderBy: [desc(posts.createdAt)] }),

  create: (name: string) => db.insert(posts).values({ name }).returning(),

  update: (id: number, name: string) =>
    db.update(posts).set({ name }).where(eq(posts.id, id)).returning(),

  delete: (id: number) => db.delete(posts).where(eq(posts.id, id)).returning(),
};
