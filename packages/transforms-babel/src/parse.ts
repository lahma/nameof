import { NodePath } from "@babel/traverse";
import * as babelTypes from "@babel/types";
import {
    ArrayExpression,
    ArrowFunctionExpression,
    BlockStatement,
    CallExpression,
    Expression,
    FunctionExpression,
    MemberExpression,
    Node,
    NumericLiteral,
    StringLiteral,
    TemplateLiteral,
    TSImportType,
    TSQualifiedName,
    TSTypeParameterInstantiation,
    UnaryExpression,
    V8IntrinsicIdentifier,
} from "@babel/types";
import { throwError } from "@ts-nameof/common";
import * as common from "@ts-nameof/transforms-common";
import { getNegativeNumericLiteralValue, getReturnStatementArgumentFromBlock, isNegativeNumericLiteral } from "./helpers";

export interface ParseOptions {
    /**
     * Action to prompt the children to be traversed. This is to allow traversing the nodes in post order.
     */
    traverseChildren?: () => void;
    /**
     * Expected identifier name at the start of the call expression. This could be different when using a macro.
     * @default Defaults to "nameof".
     */
    nameofIdentifierName?: string;
}

/**
 * Parses a Babel AST node to a common NameofCallExpression or returns undefined if the current node
 * is not a nameof call expression.
 * @param t - Babel types namespace to use.
 * @param path - Path of the current Babel AST node.
 * @param options - Options for parsing.
 * @remarks Parsing to a common structure allows for the same code to be used to determine the final string.
 */
export function parse(t: typeof babelTypes, path: NodePath, options: ParseOptions = {}) {
    if (!isNameof(path.node)) {
        return undefined;
    }

    if (options.traverseChildren) {
        options.traverseChildren(); // tell the caller to go over the nodes in post order
    }

    const propertyName = parsePropertyName(path.node);
    // ignore nameof.interpolate function calls... they will be dealt with later
    if (isInterpolatePropertyName(propertyName)) {
        handleNameofInterpolate(path.node);
        return undefined;
    }

    return parseNameof(path.node);

    function parseNameof(callExpr: CallExpression): common.NameofCallExpression {
        return {
            property: propertyName,
            typeArguments: parseTypeArguments(callExpr),
            arguments: parseArguments(callExpr),
        };
    }

    function parsePropertyName(callExpr: CallExpression) {
        const { callee } = callExpr;
        if (!t.isMemberExpression(callee) || !t.isIdentifier(callee.property)) {
            return undefined;
        }
        return callee.property.name;
    }

    function parseTypeArguments(callExpr: CallExpression) {
        // babel uses incorrect naming. these are type arguments
        const typeArguments = (callExpr as any).typeParameters as TSTypeParameterInstantiation | undefined;
        if (typeArguments == null) {
            return [];
        }
        return typeArguments.params.map(arg => parseCommonNode(arg));
    }

    function parseArguments(callExpr: CallExpression) {
        return callExpr.arguments.map(arg => parseCommonNode(arg));
    }

    function parseCommonNode(node: Node): common.Node {
        if (t.isMemberExpression(node)) {
            return parseMemberExpression(node);
        }
        if (t.isArrowFunctionExpression(node)) {
            return parseFunctionReturnExpression(node, getArrowFunctionReturnExpression(node));
        }
        if (t.isFunctionExpression(node)) {
            return parseFunctionReturnExpression(node, getReturnStatementArgumentFromBlockOrThrow(node.body));
        }
        if (t.isTSNonNullExpression(node) || t.isParenthesizedExpression(node) || t.isTSAsExpression(node)) {
            return parseCommonNode(node.expression);
        }
        if (t.isTSQualifiedName(node)) {
            return parseQualifiedName(node);
        }
        if (t.isTSTypeReference(node)) {
            return parseCommonNode(node.typeName);
        }
        if (t.isSpreadElement(node)) {
            return parseCommonNode(node.argument);
        }
        if (t.isNumericLiteral(node) || isNegativeNumericLiteral(t, node)) {
            return parseNumeric(node);
        }
        if (t.isStringLiteral(node)) {
            return parseStringLiteral(node);
        }
        if (t.isIdentifier(node)) {
            return parseIdentifier(node);
        }
        if (t.isArrayExpression(node)) {
            return parseArrayExpression(node);
        }
        if (t.isThisExpression(node)) {
            return common.createIdentifierNode("this");
        }
        if (t.isSuper(node)) {
            return common.createIdentifierNode("super");
        }
        if (t.isTSImportType(node)) {
            return parseImportType(node, false);
        }
        if (t.isTSTypeQuery(node) && t.isTSImportType(node.exprName)) {
            return parseImportType(node.exprName, true);
        }
        if (t.isTSLiteralType(node)) {
            return parseCommonNode(node.literal); // skip over and go straight to the literal
        }
        if (t.isTemplateLiteral(node)) {
            return parseTemplateExpression(node);
        }
        if (isNameof(node) && isInterpolatePropertyName(parsePropertyName(node))) {
            return parseInterpolateNode(node);
        }
        return throwError(`Unhandled node type (${node.type}) in text: ${getNodeText(node)} (Please open an issue if you believe this should be supported.)`);
    }

    function parseArrayExpression(node: ArrayExpression) {
        const result: common.Node[] = [];
        node.elements.forEach(element => {
            if (element == null) {
                return throwError(`Unsupported scenario with empty element encountered in array: ${getNodeText(node)}`);
            }
            result.push(parseCommonNode(element));
        });
        return common.createArrayLiteralNode(result);
    }

    function parseMemberExpression(node: MemberExpression) {
        const expressionCommonNode = parseCommonNode(node.object);
        const nameCommonNode = parseCommonNode(node.property);
        const computedCommonNode = node.computed ? common.createComputedNode(nameCommonNode) : undefined;
        getEndCommonNode(expressionCommonNode).next = computedCommonNode || nameCommonNode;
        return expressionCommonNode;
    }

    function parseQualifiedName(node: TSQualifiedName) {
        const leftCommonNode = parseCommonNode(node.left);
        const rightCommonNode = parseCommonNode(node.right);
        getEndCommonNode(leftCommonNode).next = rightCommonNode;
        return leftCommonNode;
    }

    function parseNumeric(node: NumericLiteral | UnaryExpression) {
        return common.createNumericLiteralNode(getNodeValue());

        function getNodeValue() {
            if (t.isNumericLiteral(node)) {
                return node.value;
            }
            return getNegativeNumericLiteralValue(t, node);
        }
    }

    function parseStringLiteral(node: StringLiteral) {
        return common.createStringLiteralNode(node.value);
    }

    function parseIdentifier(node: Node) {
        const text = getIdentifierTextOrThrow(node);
        return common.createIdentifierNode(text);
    }

    function parseFunctionReturnExpression(functionNode: FunctionExpression | ArrowFunctionExpression, node: Expression) {
        const parameterNames = functionNode.params.map(p => {
            if (t.isIdentifier(p)) {
                return p.name;
            }
            return getNodeText(p);
        });

        return common.createFunctionNode(parseCommonNode(node), parameterNames);
    }

    function parseImportType(node: TSImportType, isTypeOf: boolean) {
        const importTypeNode = common.createImportTypeNode(isTypeOf, parseCommonNode(node.argument));
        const qualifier = node.qualifier == null ? undefined : parseCommonNode(node.qualifier);
        getEndCommonNode(importTypeNode).next = qualifier;
        return importTypeNode;
    }

    function parseTemplateExpression(node: TemplateLiteral) {
        return common.createTemplateExpressionNode(getParts());

        function getParts() {
            const parts: (string | common.InterpolateNode)[] = [];

            // the number of quasis will always be greater than the number of expressions
            for (let i = 0; i < node.quasis.length; i++) {
                parts.push(node.quasis[i].value.raw);
                const expression = node.expressions[i];
                if (expression != null) {
                    parts.push(common.createInterpolateNode(expression, getNodeText(expression)));
                }
            }

            return parts;
        }
    }

    function parseInterpolateNode(node: CallExpression) {
        if (node.arguments.length !== 1) {
            return throwError(`Expected a single argument for the nameof.interpolate function call ${getNodeText(node.arguments[0])}.`);
        }
        return common.createInterpolateNode(node.arguments[0], getNodeText(node.arguments[0]));
    }

    function getEndCommonNode(commonNode: common.Node) {
        while (commonNode.next != null) {
            commonNode = commonNode.next;
        }
        return commonNode;
    }

    function getArrowFunctionReturnExpression(func: ArrowFunctionExpression) {
        if (t.isBlock(func.body)) {
            return getReturnStatementArgumentFromBlockOrThrow(func.body);
        }
        return func.body;
    }

    function getIdentifierTextOrThrow(node: Node) {
        if (!t.isIdentifier(node)) {
            return throwError(`Expected node to be an identifier: ${getNodeText(node)}`);
        }
        return node.name;
    }

    function getReturnStatementArgumentFromBlockOrThrow(block: BlockStatement) {
        return getReturnStatementArgumentFromBlock(t, block)
            || throwError(`Cound not find return statement with an expression in function expression: ${getNodeText(block)}`);
    }

    function getNodeText(node: Node) {
        const outerNodeStart = path.node.start!;
        const innerNodeStart = node.start!;
        const offset = innerNodeStart - outerNodeStart;

        return path.getSource().substr(offset, node.end! - node.start!);
    }

    function isNameof(node: Node): node is CallExpression {
        if (!t.isCallExpression(node)) {
            return false;
        }

        const identifier = getIdentifierToInspect(node.callee);
        return identifier != null && identifier.name === (options.nameofIdentifierName || "nameof");

        function getIdentifierToInspect(expression: Expression | V8IntrinsicIdentifier) {
            if (t.isIdentifier(expression)) {
                return expression;
            }
            if (t.isMemberExpression(expression) && t.isIdentifier(expression.object)) {
                return expression.object;
            }
            return undefined;
        }
    }

    function handleNameofInterpolate(callExpr: CallExpression) {
        if (!hasAncestorNameofFull()) {
            return throwError(
                `Found a nameof.interpolate that did not exist within a `
                    + `nameof.full call expression: ${getNodeText(callExpr)}`,
            );
        }

        if (callExpr.arguments.length !== 1) {
            return throwError("Unexpected scenario where a nameof.interpolate function did not have a single argument.");
        }

        function hasAncestorNameofFull() {
            let parentPath: NodePath | null | undefined = path.parentPath;
            while (parentPath != null) {
                if (isNameof(parentPath.node) && parsePropertyName(parentPath.node) === "full") {
                    return true;
                }
                parentPath = parentPath.parentPath;
            }
            return false;
        }
    }

    function isInterpolatePropertyName(propertyName: string | undefined) {
        return propertyName === "interpolate";
    }
}
