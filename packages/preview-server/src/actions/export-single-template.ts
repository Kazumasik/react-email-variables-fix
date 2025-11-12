"use server";

import path from "node:path";
import { Resend } from "resend";
import { z } from "zod";
import {
  previewServerLocation,
  resendApiKey,
  userProjectLocation,
} from "../app/env";
import { createJsxRuntime } from "../utils/create-jsx-runtime";
import { getEmailComponent } from "../utils/get-email-component";
import { baseActionClient } from "./safe-action";

// Extract variables from component PreviewProps
function extractVariablesFromProps(props: Record<string, unknown>): Array<{
  key: string;
  type: "string" | "number";
  fallbackValue: unknown;
}> {
  return Object.keys(props).map((key) => {
    const value = props[key];
    const type: "string" | "number" =
      typeof value === "number" ? "number" : "string";

    return {
      key: key.toUpperCase(),
      type,
      fallbackValue: value,
    };
  });
}

export const exportSingleTemplate = baseActionClient
  .metadata({
    actionName: "exportSingleTemplate",
  })
  .inputSchema(
    z.object({
      name: z.string(),
      html: z.string(),
      emailPath: z.string().optional(),
    })
  )
  .action(async ({ parsedInput }) => {
    const resend = new Resend(resendApiKey);

    let variables: Array<{
      key: string;
      type: "string" | "number";
      fallbackValue: unknown;
    }> = [];

    // Try to extract variables from component PreviewProps
    if (parsedInput.emailPath) {
      try {
        const originalJsxRuntimePath = path.resolve(
          previewServerLocation,
          "jsx-runtime"
        );
        const jsxRuntimePath = await createJsxRuntime(
          userProjectLocation,
          originalJsxRuntimePath
        );
        const componentResult = await getEmailComponent(
          parsedInput.emailPath,
          jsxRuntimePath
        );

        if (!("error" in componentResult)) {
          const { emailComponent } = componentResult;
          const previewProps = emailComponent.PreviewProps || {};
          variables = extractVariablesFromProps(previewProps);
        }
      } catch (error) {
        console.warn("Failed to extract variables from component:", error);
        // Continue without variables
      }
    }

    const response = await (resend.templates.create as any)({
      name: parsedInput.name,
      html: parsedInput.html,
      variables: variables.length > 0 ? variables : undefined,
    });

    if (response.error) {
      console.error("Error creating single template", response.error);
      return { name: parsedInput.name, status: "failed" as const };
    }

    return {
      name: parsedInput.name,
      status: "succeeded" as const,
      id: response.data.id,
    };
  });
