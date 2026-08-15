import type { PalworldRestEndpoint } from "../../../types/ipc";
import type { ServerRestMetadata } from "../../catalog/serverCapabilities";
import {
  buildPalworldRestAuthHeader,
  buildPalworldRestUrl,
  callPalworldRest,
  extractPalworldRestConfig,
} from "../../palworldRest";
import type {
  GameRestAdapter,
  GameRestCallRequest,
  GameRestCallResult,
  GameRestConfig,
  GameRestFetch,
} from "../types";

function isPalworldEndpoint(
  endpoint: string
): endpoint is PalworldRestEndpoint {
  return (
    endpoint === "info" ||
    endpoint === "players" ||
    endpoint === "settings" ||
    endpoint === "metrics" ||
    endpoint === "game-data" ||
    endpoint === "announce" ||
    endpoint === "kick" ||
    endpoint === "ban" ||
    endpoint === "unban" ||
    endpoint === "save" ||
    endpoint === "shutdown" ||
    endpoint === "stop"
  );
}

/**
 * Palworld REST protocol adapter — first registered game REST implementation.
 * Config key/port defaults come from catalog `server_rest_metadata`.
 */
export const palworldRestAdapter: GameRestAdapter = {
  id: "palworld",

  extractConfig(
    content: Record<string, unknown>,
    metadata: ServerRestMetadata
  ): GameRestConfig {
    return extractPalworldRestConfig(content, {
      defaultPort: metadata.defaultPort,
      enabledConfigKey: metadata.enabledConfigKey,
      portConfigKey: metadata.portConfigKey,
      passwordConfigKey: metadata.passwordConfigKey,
    });
  },

  call(
    config: GameRestConfig,
    request: GameRestCallRequest,
    fetchImpl?: GameRestFetch
  ): Promise<GameRestCallResult> {
    if (!isPalworldEndpoint(request.endpoint)) {
      return Promise.resolve({
        success: false,
        error: `Unknown Palworld REST endpoint: ${request.endpoint}`,
      });
    }

    return callPalworldRest(
      config,
      {
        method: request.method,
        endpoint: request.endpoint,
        body: request.body,
      },
      fetchImpl
    );
  },
};

/** Exported for unit tests that assert URL/auth helpers still work. */
export { buildPalworldRestAuthHeader, buildPalworldRestUrl };
