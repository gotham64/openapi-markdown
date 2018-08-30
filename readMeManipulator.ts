// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License. See License.txt in the project root for license information.

import * as commonmark from "commonmark"
import { ReadMeBuilder } from './readMeBuilder'
import { Logger } from './logger'
import * as yaml from 'js-yaml'
import { base64ToString } from './gitHubUtils';
import { MarkDownEx, markDownExToString } from "@ts-common/commonmark-to-markdown"

/**
 * Provides operations that can be applied to readme files
 */
export class ReadMeManipulator {
    constructor(private logger: Logger, private readMeBuilder: ReadMeBuilder) { }

    /**
     * Updates the latest version tag of a readme
     */
    public updateLatestTag(markDownEx: MarkDownEx, newTag: string): string {
        const startNode = markDownEx.markDown
        const codeBlockMap = getCodeBlocksAndHeadings(startNode);

        const latestHeader = "Basic Information";

        const latestDefinition = yaml.load(codeBlockMap[latestHeader].literal!) as
            | undefined
            | { tag: string };

        if (!latestDefinition) {
            this.logger.error(`Couldn't parse code block`);
            throw new Error("");
        }

        latestDefinition.tag = newTag;

        codeBlockMap[latestHeader].literal = yaml.dump(latestDefinition, {
            lineWidth: -1
        });

        return markDownExToString(markDownEx);
    }

    public stringToTree(str: string): commonmark.Node {
        const reader = new commonmark.Parser();
        return reader.parse(str);
    }

    public base64ToTree(base: string): commonmark.Node {
        const str = base64ToString(base);
        const reader = new commonmark.Parser();
        return reader.parse(str);
    }

    public insertTagDefinition(
        readmeContent: string,
        tagFiles: string[],
        newTag: string
    ) {
        const newTagDefinitionYaml = createTagDefinitionYaml(tagFiles);

        const toSplice = this.readMeBuilder.getVersionDefinition(
            newTagDefinitionYaml,
            newTag
        );

        return spliceIntoTopOfVersions(readmeContent, toSplice);
    }
}

const spliceIntoTopOfVersions = (file: string, splice: string) => {
    const index = file.indexOf("### Tag");
    return file.slice(0, index) + splice + file.slice(index);
}

const createTagDefinitionYaml = (files: string[]) => ({
    ["input-file"]: files
});

const getCodeBlocksAndHeadings = (
    startNode: commonmark.Node
): { [key: string]: commonmark.Node } => {
    return getAllCodeBlockNodes(startNode).reduce(
        (acc, curr) => {
            const headingNode = nodeHeading(curr);

            if (!headingNode) {
                return { ...acc };
            }

            const headingLiteral = getHeadingLiteral(headingNode);

            if (!headingLiteral) {
                return { ...acc };
            }

            return { ...acc, [headingLiteral]: curr };
        },
        {}
    );
}

const getHeadingLiteral = (heading: commonmark.Node): string => {
    const headingNode = walkToNode(
        heading.walker(),
        n => n.type === "text"
    );

    return headingNode && headingNode.literal ? headingNode.literal : "";
}

const getAllCodeBlockNodes = (startNode: commonmark.Node) => {
    const walker = startNode.walker()
    const result: commonmark.Node[] = []
    while (true) {
        const a = walkToNode(walker, n => n.type === "code_block")
        if (!a) {
            break
        }
        result.push(a)
    }
    return result
}

const nodeHeading = (startNode: commonmark.Node): commonmark.Node | null => {
    let resultNode: commonmark.Node | null = startNode

    while (resultNode != null && resultNode.type !== "heading") {
        resultNode = resultNode.prev || resultNode.parent
    }

    return resultNode
}

/**
 * walks a markdown tree until the callback provided returns true for a node
 */
const walkToNode = (
    walker: commonmark.NodeWalker,
    cb: (node: commonmark.Node) => boolean
): commonmark.Node | undefined => {
    let event = walker.next()

    while (event) {
        const curNode = event.node
        if (cb(curNode)) {
            return curNode
        }
        event = walker.next()
    }
    return undefined
}