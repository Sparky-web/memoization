import bcrypt from "bcryptjs";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { tanstackStartCookies } from "better-auth/tanstack-start";

import { serverEnv } from "~/env.server";

import { db } from "./db";

export const auth = betterAuth({
  baseURL: serverEnv.BETTER_AUTH_URL,
  secret: serverEnv.BETTER_AUTH_SECRET,
  database: prismaAdapter(db, { provider: "postgresql" }),
  emailAndPassword: {
    enabled: true,
    // Публичная регистрация открыта: пользователь сам создаёт аккаунт на /auth/signup
    disableSignUp: false,
    // bcrypt вместо встроенного scrypt: переносимость хэшей между проектами
    password: {
      hash: (password) => bcrypt.hash(password, 10),
      verify: ({ hash, password }) => bcrypt.compare(password, hash),
    },
  },
  plugins: [tanstackStartCookies()],
});
