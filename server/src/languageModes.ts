/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
  getCSSLanguageService,
  getLESSLanguageService,
} from "vscode-css-languageservice";

import { TextDocument, TextEdit } from "vscode-languageserver-textdocument";
import { getCSSMode } from "./modes/cssMode";
import {
  getLanguageModelCache,
  LanguageModelCache,
} from "./languageModelCache";
import { getLESSMode } from "./modes/lessMode";
import { getDocumentRegions, PugDocumentRegions } from "./embeddedSupport";
import { getJavascriptMode } from "./modes/javascriptMode";

import {
  CompletionList,
  Diagnostic,
  FormattingOptions,
  Position,
  Range,
} from "vscode-languageserver";

export * from "vscode-html-languageservice";

export interface LanguageMode {
  getId(): string;
  doValidation?: (document: TextDocument) => Diagnostic[];
  doComplete?: (document: TextDocument, position: Position) => CompletionList;
  doFormat?: (
    document: TextDocument,
    formattingOption: FormattingOptions
  ) => TextEdit[];
  onDocumentRemoved(document: TextDocument): void;

  dispose(): void;
}

export interface LanguageModes {
  getModeAtPosition(
    document: TextDocument,
    position: Position
  ): LanguageMode | undefined;
  getModesInRange(document: TextDocument, range: Range): LanguageModeRange[];
  getAllModes(): LanguageMode[];
  getAllModesInDocument(document: TextDocument): LanguageMode[];
  getMode(languageId: string): LanguageMode | undefined;
  onDocumentRemoved(document: TextDocument): void;
  dispose(): void;
}

export interface LanguageModeRange extends Range {
  mode: LanguageMode | undefined;
  attributeValue?: boolean;
}

export function getLanguageModes(): LanguageModes {
  const cssLanguageService = getCSSLanguageService();
  const lessLanguageService = getLESSLanguageService();

  const documentRegions = getLanguageModelCache<PugDocumentRegions>(
    10,
    60,
    (document) => getDocumentRegions(document)
  );

  let modelCaches: LanguageModelCache<any>[] = [];
  modelCaches.push(documentRegions);

  let modes = Object.create(null);
  modes["css"] = getCSSMode(cssLanguageService, documentRegions);
  modes["less"] = getLESSMode(lessLanguageService, documentRegions);
  modes["javascript"] = getJavascriptMode(documentRegions);

  return {
    getModeAtPosition(
      document: TextDocument,
      position: Position
    ): LanguageMode | undefined {
      const languageId = documentRegions
        .get(document)
        .getLanguageAtPosition(position);
      if (languageId) {
        return modes[languageId];
      }
      return undefined;
    },
    getModesInRange(document: TextDocument, range: Range): LanguageModeRange[] {
      return documentRegions
        .get(document)
        .getLanguageRanges(range)
        .map((r) => {
          return <LanguageModeRange>{
            start: r.start,
            end: r.end,
            mode: r.languageId && modes[r.languageId],
            attributeValue: r.attributeValue,
          };
        });
    },
    getAllModesInDocument(document: TextDocument): LanguageMode[] {
      const result = [];
      for (const languageId of documentRegions
        .get(document)
        .getLanguagesInDocument()) {
        const mode = modes[languageId];
        if (mode) {
          result.push(mode);
        }
      }
      return [...new Set(result)];
    },
    getAllModes(): LanguageMode[] {
      const result = [];
      for (const languageId in modes) {
        const mode = modes[languageId];
        if (mode) {
          result.push(mode);
        }
      }
      return result;
    },
    getMode(languageId: string): LanguageMode {
      return modes[languageId];
    },
    onDocumentRemoved(document: TextDocument) {
      modelCaches.forEach((mc) => mc.onDocumentRemoved(document));
      for (const mode in modes) {
        modes[mode].onDocumentRemoved(document);
      }
    },
    dispose(): void {
      modelCaches.forEach((mc) => mc.dispose());
      modelCaches = [];
      for (const mode in modes) {
        modes[mode].dispose();
      }
      modes = {};
    },
  };
}
