import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";
import { fromIni } from "@aws-sdk/credential-providers";
import { SavedConnection } from "../model/connection";
import { ErrorReporter } from "./errorReporter";

interface CachedSecret {
  password: string;
  expiresAt: number;
}

const SECRET_CACHE_TTL_MS = 5 * 60 * 1000;

export class AwsSecretProvider {
  private readonly cache = new Map<string, CachedSecret>();

  public constructor(private readonly errorReporter?: ErrorReporter) {}

  public async getPassword(
    connection: SavedConnection,
    forceRefresh = false,
  ): Promise<string> {
    if (connection.authMode !== "awsSecret" || !connection.awsSecret) {
      throw new Error(
        "AWS secret retrieval is only available for AWS-backed connections.",
      );
    }

    const cacheKey = this.getCacheKey(connection);
    const cached = this.cache.get(cacheKey);

    if (!forceRefresh && cached && cached.expiresAt > Date.now()) {
      return cached.password;
    }

    const resolvedRegion =
      connection.awsSecret.region ||
      this.inferRegionFromSecretId(connection.awsSecret.secretId);
    const client = new SecretsManagerClient({
      region: resolvedRegion,
      credentials: fromIni({ profile: connection.awsSecret.profile }),
    });

    const response = await client.send(
      new GetSecretValueCommand({
        SecretId: connection.awsSecret.secretId,
      }),
    );

    const secretText =
      response.SecretString ??
      (response.SecretBinary
        ? Buffer.from(response.SecretBinary).toString("utf8")
        : undefined);

    if (!secretText) {
      throw new Error("The AWS secret did not contain a string payload.");
    }

    const password = this.extractPassword(
      secretText,
      connection.awsSecret.passwordKey,
    );
    this.cache.set(cacheKey, {
      password,
      expiresAt: Date.now() + SECRET_CACHE_TTL_MS,
    });
    this.errorReporter?.info("AWS secret resolved.", {
      connectionId: connection.id,
      connectionName: connection.name,
      secretId: connection.awsSecret.secretId,
      profile: connection.awsSecret.profile,
      region: resolvedRegion,
      forceRefresh,
    });

    return password;
  }

  public invalidate(connection: SavedConnection): void {
    this.cache.delete(this.getCacheKey(connection));
  }

  public async prewarm(connections: SavedConnection[]): Promise<void> {
    const awsConnections = connections.filter(
      (connection) => connection.authMode === "awsSecret",
    );
    this.errorReporter?.info("Prewarming AWS-backed connections.", {
      connectionCount: awsConnections.length,
    });

    const results = await Promise.allSettled(
      awsConnections.map(async (connection) => this.getPassword(connection)),
    );

    results.forEach((result, index) => {
      if (result.status === "rejected") {
        const connection = awsConnections[index];
        this.errorReporter?.error(result.reason, {
          operation: "awsSecret.prewarm",
          details: {
            connectionId: connection.id,
            connectionName: connection.name,
          },
        });
      }
    });
  }

  private extractPassword(secretText: string, passwordKey: string): string {
    try {
      const parsed = JSON.parse(secretText) as Record<string, unknown>;
      const candidate = parsed[passwordKey];

      if (typeof candidate === "string" && candidate.trim()) {
        return candidate;
      }

      throw new Error(
        `The key "${passwordKey}" was not found in the secret JSON payload.`,
      );
    } catch (error) {
      if (passwordKey === "value" || passwordKey === "password") {
        return secretText;
      }

      if (error instanceof Error) {
        throw new Error(
          `Unable to read password key "${passwordKey}" from the AWS secret payload. ${error.message}`,
        );
      }

      throw new Error("Unable to read the AWS secret payload.");
    }
  }

  private inferRegionFromSecretId(secretId: string): string | undefined {
    const arnParts = secretId.split(":");
    if (
      arnParts.length >= 4 &&
      arnParts[0] === "arn" &&
      arnParts[2] === "secretsmanager"
    ) {
      return arnParts[3];
    }

    return undefined;
  }

  private getCacheKey(connection: SavedConnection): string {
    return [
      connection.awsSecret?.profile ?? "",
      connection.awsSecret?.region ?? "",
      connection.awsSecret?.secretId ?? "",
      connection.awsSecret?.passwordKey ?? "",
    ].join("|");
  }
}
