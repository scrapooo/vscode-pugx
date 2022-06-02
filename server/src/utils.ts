import * as fs from "fs";
import * as path from "path";

export function readdirs(dir: string): string[] {
  const allfiles: string[] = [];
  const dirFiles = fs.readdirSync(dir);
  dirFiles.forEach((item) => {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      allfiles.push(...readdirs(path.join(dir, item)));
    } else {
      allfiles.push(fullPath);
    }
  });
  return allfiles;
}

export function readJSON(file: string): any {
  if (fs.existsSync(file)) {
    return JSON.parse(
      fs.readFileSync(file, {
        encoding: "UTF-8",
      })
    );
  }
}
