# SQL Connection Workbench

A VS Code extension for browsing SQL schemas, managing saved database connections, and running ad hoc SQL queries.

[Install](https://marketplace.visualstudio.com/items?itemName=JamesWright.sql-connection-workbench)

## Features

- PostgreSQL, MySQL, and SQL Server connection support
- Password storage in VS Code Secret Storage
- AWS Secrets Manager password retrieval using secret id/ARN, AWS profile, and password key
- Database discovery when the database field is left blank, including schemas visible within each accessible database
- Schema visibility selection to keep the explorer focused
- Explorer nodes for schemas, roles, and types
- Query runner with tabular results inside a themed webview

## AWS Secret Format

For AWS-backed connections, the extension expects the secret value to be JSON and uses the configured `passwordKey` to extract the password. Example:

```json
{
  "username": "readonly_user",
  "password": "rotating-password-value"
}
```

If your secret is a raw string instead of JSON, use `password` or `value` as the key.

## Usage

1. Open the `SQL Workbench` activity bar view.
2. Create a connection and choose either a stored password or AWS Secrets Manager.
3. If you do not know which database to use, leave the database field blank and use `Discover DBs` to scan accessible databases and schemas.
4. Save the connection, then use `Choose Schemas` to decide which schemas appear in the explorer.
5. Open the workbench, write SQL, and run queries against the selected saved connection.

## Development

```bash
bun install
bun run build
```

Launch the extension from VS Code using the `Run Extension` debug configuration.

## Publishing

GitHub Actions publishing is configured in [.github/workflows/publish.yml](/C:/code-person/db-extension/.github/workflows/publish.yml).

Before publishing:

1. Replace the `publisher` field in [package.json](/C:/code-person/db-extension/package.json) with your real Visual Studio Marketplace publisher id.
2. Create a Marketplace personal access token and store it as the `VSCE_PAT` repository secret.
3. Push a tag like `v0.1.0` or run the workflow manually from GitHub Actions.

The workflow installs dependencies, runs tests, packages the extension, and publishes it with `vsce`.
