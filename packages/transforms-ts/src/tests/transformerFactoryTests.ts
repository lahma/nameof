import { runCommonTests } from "@ts-nameof/tests-common";
import * as ts from "typescript";
import { transformerFactory } from "../transformerFactory";

/**
 * Represents a file.
 */
interface IFileInfo
{
    /**
     * The name of the file.
     */
    fileName: string;

    /**
     * The contents of the file.
     */
    fileText: string;
}

runCommonTests(run);

/**
 * Transforms the specified {@link text `text`}.
 *
 * @param text
 * The text to transform.
 *
 * @returns
 * The transformed text.
 */
function run(text: string): string
{
    const results: IFileInfo[] = [];

    const compilerOptions: ts.CompilerOptions = {
        strictNullChecks: true,
        target: ts.ScriptTarget.ES2017
    };

    const transformers: ts.CustomTransformers = {
        before: [transformerFactory],
        after: []
    };

    const testFileName = "/file.ts";

    const host: ts.CompilerHost = {
        fileExists: (fileName: string) => fileName === testFileName,
        readFile: (fileName: string) => fileName === testFileName ? text : undefined,
        getSourceFile: (fileName, languageVersion) =>
        {
            if (fileName !== testFileName)
            {
                return undefined;
            }

            return ts.createSourceFile(fileName, text, languageVersion, false, ts.ScriptKind.TS);
        },
        getDefaultLibFileName: options => ts.getDefaultLibFileName(options),
        writeFile: () =>
        {
            throw new Error("Not implemented");
        },
        getCurrentDirectory: () => "/",
        getDirectories: () => [],
        getCanonicalFileName: fileName => fileName,
        useCaseSensitiveFileNames: () => true,
        getNewLine: () => "\n"
    };

    const program = ts.createProgram(["/file.ts"], compilerOptions, host);
    program.emit(undefined, (fileName, fileText) => results.push({ fileName, fileText }), undefined, false, transformers);
    return results[0].fileText;
}
