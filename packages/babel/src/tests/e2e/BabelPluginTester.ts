import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import babel = require("@babel/core");
import { IErrorHandler } from "@typescript-nameof/common";
import { TransformerTester } from "@typescript-nameof/test";
import { BabelTransformer } from "../../Transformation/BabelTransformer.cjs";
import { IBabelContext } from "../../Transformation/IBabelContext.cjs";

/**
 * Provides the functionality to test the babel plugin.
 */
export class BabelPluginTester extends TransformerTester<babel.Node, IBabelContext>
{
    /**
     * @inheritdoc
     */
    protected override get Title(): string
    {
        return "plugin";
    }

    /**
     * @inheritdoc
     *
     * @param code
     * The code to transform.
     *
     * @param errorHandler
     * A component for reporting errors.
     *
     * @returns
     * The transformed representation of the specified {@linkcode code}.
     */
    protected async Run(code: string, errorHandler?: IErrorHandler<babel.Node, IBabelContext>): Promise<string>
    {
        let plugin = (babelAPI: typeof babel): babel.PluginObj =>
        {
            return new BabelTransformer(babelAPI, errorHandler).Plugin;
        };

        return (
            await babel.transformAsync(
            code,
            {
                presets: [
                    "@babel/preset-typescript"
                ],
                plugins: [
                    plugin
                ],
                filename: resolve(fileURLToPath(new URL(".", import.meta.url)), "test.ts"),
                ast: false,
                generatorOpts: {
                    retainLines: true
                }
            }))?.code ?? "";
    }
}
