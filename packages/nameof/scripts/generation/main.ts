// eslint-disable-next-line import/no-extraneous-dependencies
import { ArgsChecker } from "@typescript-nameof/scripts-common";
import { createDeclarationFile } from "./createDeclarationFile";
import { getProject } from "../common";

const argsChecker = new ArgsChecker();
const project = getProject();

if (argsChecker.checkHasArg("create-declaration-file"))
{
    console.log("Creating declaration file...");
    createDeclarationFile(project);
}

argsChecker.verifyArgsUsed();
project.save();
