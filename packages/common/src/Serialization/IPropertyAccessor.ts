import { INamedPathPart } from "./INamedPathPart";
import { PathKind } from "./PathKind";

/**
 * Represents a property accessor.
 */
export interface IPropertyAccessor extends INamedPathPart<string>
{
    /**
     * @inheritdoc
     */
    type: PathKind.PropertyAccess;
}
