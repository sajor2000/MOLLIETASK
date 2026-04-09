/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as aiActions from "../aiActions.js";
import type * as authHelpers from "../authHelpers.js";
import type * as authInternal from "../authInternal.js";
import type * as crons from "../crons.js";
import type * as http from "../http.js";
import type * as pushActions from "../pushActions.js";
import type * as pushNotifications from "../pushNotifications.js";
import type * as rateLimit from "../rateLimit.js";
import type * as reminders from "../reminders.js";
import type * as staff from "../staff.js";
import type * as subtasks from "../subtasks.js";
import type * as taskAttachments from "../taskAttachments.js";
import type * as taskTemplates from "../taskTemplates.js";
import type * as tasks from "../tasks.js";
import type * as telegram from "../telegram.js";
import type * as telegramBot from "../telegramBot.js";
import type * as telegramFormat from "../telegramFormat.js";
import type * as users from "../users.js";
import type * as validation from "../validation.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  aiActions: typeof aiActions;
  authHelpers: typeof authHelpers;
  authInternal: typeof authInternal;
  crons: typeof crons;
  http: typeof http;
  pushActions: typeof pushActions;
  pushNotifications: typeof pushNotifications;
  rateLimit: typeof rateLimit;
  reminders: typeof reminders;
  staff: typeof staff;
  subtasks: typeof subtasks;
  taskAttachments: typeof taskAttachments;
  taskTemplates: typeof taskTemplates;
  tasks: typeof tasks;
  telegram: typeof telegram;
  telegramBot: typeof telegramBot;
  telegramFormat: typeof telegramFormat;
  users: typeof users;
  validation: typeof validation;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
