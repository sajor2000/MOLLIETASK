import { AuthConfig } from "convex/server";

export default {
  providers: [
    {
      domain: "https://literate-dingo-92.clerk.accounts.dev",
      applicationID: "convex",
    },
  ],
} satisfies AuthConfig;
