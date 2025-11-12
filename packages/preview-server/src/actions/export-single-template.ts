"use server";

import { Resend } from "resend";
import { z } from "zod";
import { resendApiKey } from "../app/env";
import { baseActionClient } from "./safe-action";

/**
 * Converts preview props to Resend variables array
 * Resend only supports string and number types
 */
function createResendVariables(
  previewProps?: Record<string, any>
):
  | Array<
      | { key: string; type: "string"; fallbackValue?: string | null }
      | { key: string; type: "number"; fallbackValue?: number | null }
    >
  | undefined {
  if (!previewProps || Object.keys(previewProps).length === 0) {
    return undefined;
  }

  return Object.entries(previewProps).map(([key, value]) => {
    // Determine type and fallback value
    const valueType = typeof value;

    if (valueType === "number") {
      return {
        key,
        type: "number" as const,
        fallbackValue: value,
      };
    }

    // Convert everything else to string (including booleans)
    return {
      key,
      type: "string" as const,
      fallbackValue: String(value),
    };
  });
}

/**
 * Converts HTML with preview prop values to Resend template format
 * by replacing prop values with Resend variable syntax {{{VARIABLE_NAME}}}
 * Note: Resend requires TRIPLE curly braces, not double!
 */
function convertToResendTemplate(
  html: string,
  previewProps?: Record<string, any>
): string {
  if (!previewProps || Object.keys(previewProps).length === 0) {
    return html;
  }

  let result = html;

  Object.entries(previewProps).forEach(([key, value]) => {
    // Only process string values as they can appear in HTML
    if (typeof value !== "string") {
      return;
    }

    // Resend requires TRIPLE curly braces
    const resendVariable = `{{{${key}}}}`;

    // Escape special regex characters in the value
    const escapedValue = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    // Replace plain text occurrences
    result = result.replace(new RegExp(escapedValue, "g"), resendVariable);

    // Replace URL-encoded occurrences (for href attributes)
    const encodedValue = encodeURIComponent(value);
    if (encodedValue !== value) {
      const escapedEncodedValue = encodedValue.replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&"
      );
      result = result.replace(
        new RegExp(escapedEncodedValue, "g"),
        resendVariable
      );
    }
  });

  return result;
}

export const exportSingleTemplate = baseActionClient
  .metadata({
    actionName: "exportSingleTemplate",
  })
  .inputSchema(
    z.object({
      name: z.string(),
      emailPath: z.string(),
      html: z.string(), // Keep for backwards compatibility, but won't use it
      previewProps: z.record(z.string(), z.any()).optional(),
    })
  )
  .action(async ({ parsedInput }) => {
    const resend = new Resend(resendApiKey);

    // Generate variables array from preview props
    const variables = createResendVariables(parsedInput.previewProps);

    // Convert HTML by replacing prop values with {{variableName}} placeholders
    const htmlWithVariables = convertToResendTemplate(
      parsedInput.html,
      parsedInput.previewProps
    );

    // Log template creation details
    console.log("Creating Resend template:", {
      name: parsedInput.name,
      previewProps: parsedInput.previewProps,
      variables,
      htmlSnippet: htmlWithVariables.substring(0, 200) + "...",
    });

    const response = await resend.templates.create({
      name: parsedInput.name,
      html: htmlWithVariables,
      ...(variables && { variables }),
    });

    if (response.error) {
      console.error("Error creating single template", response.error);
      return { name: parsedInput.name, status: "failed" as const };
    }

    console.log("Template created successfully:", {
      name: parsedInput.name,
      id: response.data.id,
      variablesCount: variables?.length ?? 0,
    });

    return {
      name: parsedInput.name,
      status: "succeeded" as const,
      id: response.data.id,
    };
  });
