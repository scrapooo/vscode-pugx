/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import {
  CompletionList,
  createConnection,
  Diagnostic,
  InitializeParams,
  ProposedFeatures,
  TextDocuments,
  TextDocumentSyncKind,
} from "vscode-languageserver";
import { getLanguageModes, LanguageModes, TextEdit } from "./languageModes";
import { TextDocument } from "vscode-languageserver-textdocument";
import { createLinterOptions } from "./services/eslinter";
import { Range } from "vscode-languageserver";

// Create a connection for the server. The connection uses Node's IPC as a transport.
// Also include all preview / proposed LSP features.
const connection = createConnection(ProposedFeatures.all);

// Create a simple text document manager. The text document manager
// supports full document sync only
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

let languageModes: LanguageModes;

connection.onInitialize((_params: InitializeParams) => {
  languageModes = getLanguageModes();

  documents.onDidClose((e) => {
    languageModes.onDocumentRemoved(e.document);
  });
  connection.onShutdown(() => {
    languageModes.dispose();
  });

  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Full,
      completionProvider: {
        resolveProvider: false,
        triggerCharacters: [".", ":", "<", '"', "'", "/", "@", "*", " "],
      },
      documentFormattingProvider: true,
    },
  };
});

function createSercies() {
  return connection.workspace.getWorkspaceFolders().then((workspaces) => {
    if (workspaces) {
      const workspace = workspaces[0];
      createLinterOptions(workspace);
    }
  });
}

connection.onInitialized(createSercies);

connection.onDidChangeConfiguration(async (_change) => {
  await createSercies();
  documents.all().forEach(validateTextDocument);
});

documents.onDidChangeContent((change) => {
  validateTextDocument(change.document);
});

documents.onDidOpen((change) => {
  validateTextDocument(change.document);
});

async function validateTextDocument(textDocument: TextDocument) {
  try {
    const version = textDocument.version;
    const diagnostics: Diagnostic[] = [];
    if (textDocument.languageId === "pugx") {
      const modes = languageModes.getAllModesInDocument(textDocument);
      const latestTextDocument = documents.get(textDocument.uri);
      if (latestTextDocument && latestTextDocument.version === version) {
        // check no new version has come in after in after the async op
        modes.forEach((mode) => {
          if (mode.doValidation) {
            mode.doValidation(latestTextDocument).forEach((d) => {
              diagnostics.push(d);
            });
          }
        });
        connection.sendDiagnostics({
          uri: latestTextDocument.uri,
          diagnostics,
        });
      }
    }
  } catch (e) {
    connection.console.error(`Error while validating ${textDocument.uri}`);
    connection.console.error(String(e));
  }
}

connection.onCompletion(async (textDocumentPosition, token) => {
  const document = documents.get(textDocumentPosition.textDocument.uri);
  if (!document) {
    return null;
  }

  const mode = languageModes.getModeAtPosition(
    document,
    textDocumentPosition.position
  );
  if (!mode || !mode.doComplete) {
    return CompletionList.create();
  }
  const doComplete = mode.doComplete!;

  return doComplete(document, textDocumentPosition.position);
});

connection.onDocumentFormatting(async (param, token) => {
  const document = documents.get(param.textDocument.uri);
  if (!document || document.languageId !== "pugx") {
    return null;
  }

  const modes = languageModes.getAllModesInDocument(document);
  const changes: TextEdit[] = [];
  modes.forEach((mode) => {
    if (mode.doFormat) {
      const textEdits: TextEdit[] = mode.doFormat(document, param.options);
      changes.push(...textEdits);
    }
  });

  const trimeChange = buildTrimEndTextEdit(document);
  trimeChange && changes.push(trimeChange);

  connection.workspace.applyEdit({
    changes: {
      [param.textDocument.uri]: changes,
    },
  });
  token.onCancellationRequested(() => {});
});

function buildTrimEndTextEdit(document: TextDocument): TextEdit | null {
  const text = document.getText();
  const trimStartOffset = text.search(/\n\s*$/);
  if (-1 === trimStartOffset) return null;

  const trimEndOffset = text.length;
  return {
    range: Range.create(
      document.positionAt(trimStartOffset),
      document.positionAt(trimEndOffset)
    ),
    newText: "",
  };
}

// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

// Listen on the connection
connection.listen();
