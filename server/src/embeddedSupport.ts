/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TextDocument, Position, Range } from "./languageModes";
const lexer = require("pug-lexer");
const parse = require("pug-parser");
const walk = require("pug-walk");

export interface LanguageRange extends Range {
  languageId: string | undefined;
  attributeValue?: boolean;
}

export interface PugDocumentRegions {
  getEmbeddedDocument(
    languageId: string,
    ignoreAttributeValues?: boolean
  ): TextDocument;
  getLanguageRanges(range: Range): LanguageRange[];
  getLanguageAtPosition(position: Position): string | undefined;
  getLanguagesInDocument(): string[];
  getRegions(languageId: string): EmbeddedRegion[];
}

export interface EmbeddedRegion {
  languageId: string | undefined;
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
  attributeValue?: boolean;
}

export function getDocumentRegions(document: TextDocument): PugDocumentRegions {
  const regions: EmbeddedRegion[] = parseRegions(document);

  return {
    getLanguageRanges: (range: Range) =>
      getLanguageRanges(document, regions, range),
    getEmbeddedDocument: (languageId: string, ignoreAttributeValues: boolean) =>
      getEmbeddedDocument(document, regions, languageId, ignoreAttributeValues),
    getLanguageAtPosition: (position: Position) =>
      getLanguageAtPosition(document, regions, position),
    getLanguagesInDocument: () =>
      regions.filter((a) => a.languageId).map((s) => s.languageId as string),
    getRegions: (languageId: string) => {
      return regions.filter((a) => a.languageId === languageId);
    },
  };
}

function getLanguageRanges(
  document: TextDocument,
  regions: EmbeddedRegion[],
  range: Range
): LanguageRange[] {
  const languageRangs: LanguageRange[] = [];

  regions.forEach((region) => {
    if (
      region.startLine <= range.start.line &&
      region.endLine >= range.start.line
    ) {
      languageRangs.push({
        ...range,
        languageId: region.languageId,
      });
    }
  });
  return languageRangs;
}

function getEmbeddedDocument(
  document: TextDocument,
  regions: EmbeddedRegion[],
  languageId: string,
  ignoreAttributeValues: boolean
): TextDocument {
  let result = "";

  regions.forEach((region) => {
    if (region.languageId === languageId) {
      const emptyLines = new Array(
        region.startLine + 1 - result.split("\n").length
      )
        .fill("\n")
        .join(""); // 增加空行是为了lint时候能在文档中标识正确的位置
      result += emptyLines;
      result += document.getText({
        start: Position.create(region.startLine, region.startColumn),
        end: Position.create(region.endLine, region.endColumn),
      });
    }
  });

  const doc: TextDocument = TextDocument.create(
    document.uri,
    languageId,
    document.version,
    result
  );
  return doc;
}

function getLanguageAtPosition(
  document: TextDocument,
  regions: EmbeddedRegion[],
  position: Position
): string | undefined {
  return regions.find(
    (a) => a.startLine <= position.line && a.endLine >= position.line
  )?.languageId;
}

function parseRegions(document: TextDocument): EmbeddedRegion[] {
  const langnodes: EmbeddedRegion[] = [];
  try {
    const ast = parse(lexer(document.getText()));
    walk(ast, (node: any) => {
      if (node.type === "Tag" && node.block.nodes.length > 0) {
        if (node.name === "style") {
          const isLess = node.attrs.some(
            (a: any) => a.name === "lang" && a.val === '"less"'
          );
          if (isLess) {
            langnodes.push(buildRegionFromNode(node, "less"));
          } else {
            langnodes.push(buildRegionFromNode(node, "css"));
          }
        }
        if (node.name === "script") {
          langnodes.push(buildRegionFromNode(node, "javascript"));
        }
      }
    });
  } catch (e) {
    console.log(e);
  }

  return langnodes.filter(Boolean);
}

function buildRegionFromNode(node: any, languageId: string): EmbeddedRegion {
  const textNodes = node.block.nodes;
  const lastNode = textNodes[textNodes.length - 1];
  return {
    languageId,
    startLine: textNodes[0].line - 1,
    startColumn: 0,
    endLine: lastNode.line - 1,
    endColumn: lastNode.column + lastNode.val.length,
  };
}
