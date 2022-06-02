/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
  EmbeddedRegion,
  LanguageRange,
  PugDocumentRegions,
} from "../embeddedSupport";
import { LanguageModelCache } from "../languageModelCache";
import { LanguageMode, Position } from "../languageModes";
import { TextDocument, TextEdit } from "vscode-languageserver-textdocument";
import {
  FormattingOptions,
  LanguageService,
  Range,
} from "vscode-css-languageservice";
import { doc, format } from "prettier";

export function getLESSMode(
  lessLanguageService: LanguageService,
  documentRegions: LanguageModelCache<PugDocumentRegions>
): LanguageMode {
  return {
    getId() {
      return "less";
    },
    doValidation(document: TextDocument) {
      const embedded = documentRegions
        .get(document)
        .getEmbeddedDocument("less");
      const stylesheet = lessLanguageService.parseStylesheet(embedded);
      return lessLanguageService.doValidation(embedded, stylesheet);
    },
    doComplete(document: TextDocument, position: Position) {
      const embedded = documentRegions
        .get(document)
        .getEmbeddedDocument("less");
      const stylesheet = lessLanguageService.parseStylesheet(embedded);
      return lessLanguageService.doComplete(embedded, position, stylesheet);
    },
    doFormat(
      document: TextDocument,
      formattingOption: FormattingOptions
    ): TextEdit[] {
      const regions: EmbeddedRegion[] = documentRegions
        .get(document)
        .getRegions(this.getId());

      const textEdits: TextEdit[] = [];
      regions.forEach((region) => {
        const range = Range.create(
          region.startLine,
          region.startColumn,
          region.endLine,
          region.endColumn
        );
        const text = document.getText(range);
        let newText = format(text, { parser: "less" });
        const space = findTabStr(document, region, formattingOption);
        newText = newText
          .split("\n")
          .map((a) => (a.trim() ? space + a : ""))
          .join("\n");

        textEdits.push({
          range,
          newText: newText,
        });
      });
      return textEdits;
    },
    onDocumentRemoved(_document: TextDocument) {
      /* nothing to do */
    },
    dispose() {
      /* nothing to do */
    },
  };
}

export function findTabStr(
  document: TextDocument,
  region: EmbeddedRegion,
  formattingOption: FormattingOptions
) {
  const text = document.getText(
    Range.create(region.startLine, 0, region.startLine + 1, 0)
  );
  let space = text.match(/^\s+/)?.[0];
  if (!space) {
    space = (formattingOption.insertSpaces ? " " : "\t").repeat(
      formattingOption.tabSize
    );
  }
  return space;
}
