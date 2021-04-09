import Item from "./Item";
import Dependency from "./Dependency";
import { statusBarItem } from "../ui/indicators";
import {
  versions as loVersions,
  checkCargoRegistry,
} from "../api/local_registry";
import { versions as ghVersions } from "../api/github";
import compareVersions from "../semver/compareVersions";
import { CompletionItem, CompletionItemKind, CompletionList } from "vscode";
import { sortText } from "../providers/autoCompletion";

export function fetchCrateVersions(
  dependencies: Item[],
  shouldListPreRels: boolean,
  githubToken?: string,
  useLocalIndex?: boolean,
  localIndexHash?: string,
  localGitBranch?: string
): [Promise<Dependency[]>, Map<string, Dependency>] {
  statusBarItem.setText("👀 Fetching crates.io");

  const isLocalIndexAvailable = useLocalIndex && checkCargoRegistry(localIndexHash, localGitBranch);
  const versions = isLocalIndexAvailable ? loVersions : ghVersions;

  let responsesMap: Map<string, Dependency> = new Map();

  const responses = dependencies.map(
    (item: Item): Promise<Dependency> => {
      // Check settings and if local registry enabled control cargo home. Fallback is the github index.
      return versions(item.key, githubToken)
        .then((json: any) => {
          const versions = json.versions
            .reduce((result: any[], item: any) => {
              const isPreRelease =
                !shouldListPreRels && item.num.indexOf("-") !== -1;
              if (!item.yanked && !isPreRelease) {
                result.push(item.num);
              }
              return result;
            }, [])
            .sort(compareVersions)
            .reverse();

          let i = 0;
          const completionItems = new CompletionList(
            versions.map((version: string) => {
              const completionItem = new CompletionItem(
                version,
                CompletionItemKind.Class
              );
              completionItem.preselect = i === 0;
              completionItem.sortText = sortText(i++);
              return completionItem;
            }),
            true
          );

          return {
            item,
            versions,
            completionItems,
          };
        })
        .then((dependency: Dependency) => {
          responsesMap.set(item.key, dependency);
          return dependency;
        })
        .catch((error: Error) => {
          console.error(error);
          return {
            item,
            error: item.key + ": " + error,
          };
        });
    }
  );

  return [Promise.all(responses), responsesMap];
}
