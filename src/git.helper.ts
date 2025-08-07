import fs from "fs";
import path from "path";

const GIT_FILES = ["config", "description", "index", "shallow", "commondir"];

const refpaths = (ref: string) => [
  `${ref}`,
  `refs/${ref}`,
  `refs/tags/${ref}`,
  `refs/heads/${ref}`,
  `refs/remotes/${ref}`,
  `refs/remotes/${ref}/HEAD`,
];

function getConfig(gitdir: string) {
  // We can improve efficiency later if needed.
  // TODO: read from full list of git config files
  let text = null;
  try {
    text = fs.readFileSync(`${gitdir}/config`, { encoding: "utf8" });
  } catch (error) {}
  return getGitConfig(text);
}

function getGitConfig(text: any) {
  let section: any = null;
  let subsection: any = null;
  let parsedConfig = text
    ? text.split("\n").map((line: string) => {
        let name: any = null;
        let value = null;

        const trimmedLine = line.trim();
        const extractedSection = extractSectionLine(trimmedLine);
        const isSection = extractedSection != null;
        if (isSection) {
          [section, subsection] = extractedSection;
        } else {
          const extractedVariable = extractVariableLine(trimmedLine);
          const isVariable = extractedVariable != null;
          if (isVariable) {
            [name, value] = extractedVariable;
          }
        }

        const path = getPath(section, subsection, name);
        return { line, isSection, section, subsection, name, value, path };
      })
    : [];
  return parsedConfig;
}

const SECTION_LINE_REGEX = /^\[([A-Za-z0-9-.]+)(?: "(.*)")?\]$/;
const SECTION_REGEX = /^[A-Za-z0-9-.]+$/;

// variable lines contain a name, and equal sign and then a value
// variable lines can also only contain a name (the implicit value is a boolean true)
// variable name is alphanumeric (ASCII) with -
// variable name starts with an alphabetic character
// variable name is case insensitive
const VARIABLE_LINE_REGEX = /^([A-Za-z][A-Za-z-]*)(?: *= *(.*))?$/;
const VARIABLE_NAME_REGEX = /^[A-Za-z][A-Za-z-]*$/;

const VARIABLE_VALUE_COMMENT_REGEX = /^(.*?)( *[#;].*)$/;

const extractSectionLine = (line: string) => {
  const matches = SECTION_LINE_REGEX.exec(line);
  if (matches != null) {
    const [section, subsection] = matches.slice(1);
    return [section, subsection];
  }
  return null;
};

const extractVariableLine = (line: string) => {
  const matches = VARIABLE_LINE_REGEX.exec(line);
  if (matches != null) {
    const [name, rawValue = "true"] = matches.slice(1);
    const valueWithoutComments = removeComments(rawValue);
    const valueWithoutQuotes = removeQuotes(valueWithoutComments);
    return [name, valueWithoutQuotes];
  }
  return null;
};

const removeComments = (rawValue: string) => {
  const commentMatches = VARIABLE_VALUE_COMMENT_REGEX.exec(rawValue);
  if (commentMatches == null) {
    return rawValue;
  }
  const [valueWithoutComment, comment] = commentMatches.slice(1);
  // if odd number of quotes before and after comment => comment is escaped
  if (
    hasOddNumberOfQuotes(valueWithoutComment) &&
    hasOddNumberOfQuotes(comment)
  ) {
    return `${valueWithoutComment}${comment}`;
  }
  return valueWithoutComment;
};

const hasOddNumberOfQuotes = (text: string) => {
  const numberOfQuotes = (text.match(/(?:^|[^\\])"/g) || []).length;
  return numberOfQuotes % 2 !== 0;
};

const removeQuotes = (text: string) => {
  return text.split("").reduce((newText, c, idx, text) => {
    const isQuote = c === '"' && text[idx - 1] !== "\\";
    const isEscapeForQuote = c === "\\" && text[idx + 1] === '"';
    if (isQuote || isEscapeForQuote) {
      return newText;
    }
    return newText + c;
  }, "");
};

const lower = (text: string) => {
  return text != null ? text.toLowerCase() : null;
};

const getPath = (section: string, subsection: string, name: string) => {
  return [lower(section), subsection, lower(name)]
    .filter((a) => a != null)
    .join(".");
};

interface ResolveRefParams {
  dir: string;
  gitdir?: string;
  ref: string;
  depth?: number | undefined;
}

interface PackedRefsEntry {
  line: string;
  comment?: boolean;
  ref?: string;
  oid?: string;
  peeled?: string;
}

interface PackedRefs {
  refs: Map<string, string>;
  parsedConfig: PackedRefsEntry[];
}

function resolveRef({
  gitdir,
  ref,
  depth = undefined,
}: {
  gitdir: string;
  ref: string;
  depth?: number;
}): string {
  try {
    gitdir = path.join(gitdir, ".git");
    const oid = resolveRefInternal({
      gitdir,
      ref,
      depth,
    });
    return oid;
  } catch (err: any) {
    err.caller = "git.resolveRef";
    throw err;
  }
}

function resolveRefInternal({
  gitdir,
  ref,
  depth,
}: {
  gitdir: string;
  ref: string;
  depth?: number;
}): string {
  if (depth !== undefined) {
    depth--;
    if (depth === -1) {
      return ref;
    }
  }

  // Is it a ref pointer?
  if (ref.startsWith("ref: ")) {
    ref = ref.slice("ref: ".length);
    return resolveRefInternal({ gitdir, ref, depth });
  }

  // Is it a complete and valid SHA?
  if (ref.length === 40 && /[0-9a-f]{40}/.test(ref)) {
    return ref;
  }

  // Get packed refs map
  const packedMap = getPackedRefs({ gitdir });

  // Look in all the proper paths, in this order
  const allpaths = refpaths(ref).filter((p: string) => !GIT_FILES.includes(p)); // exclude git system files (#709)

  for (const refPath of allpaths) {
    let sha: string | undefined;
    try {
      // Try to read from file system first
      sha = fs.readFileSync(`${gitdir}/${refPath}`, { encoding: "utf8" });
    } catch (err) {
      // If file doesn't exist, try packed refs
      sha = packedMap.get(refPath);
    }

    if (sha) {
      return resolveRefInternal({ gitdir, ref: sha.trim(), depth });
    }
  }

  // Do we give up?
  throw new Error(ref);
}

function getPackedRefs({ gitdir }: { gitdir: string }): Map<string, string> {
  let text: string;
  try {
    text = fs.readFileSync(`${gitdir}/packed-refs`, { encoding: "utf8" });
  } catch (err) {
    // If packed-refs doesn't exist, return empty map
    text = "";
  }
  const packed = parsePackedRefs(text);
  return packed.refs;
}

function parsePackedRefs(text: string): PackedRefs {
  let refs = new Map<string, string>();
  let parsedConfig: any[] = [];

  if (text) {
    let key: string | null = null;
    parsedConfig = text
      .trim()
      .split("\n")
      .map((line) => {
        if (/^\s*#/.test(line)) {
          return { line, comment: true };
        }
        const i = line.indexOf(" ");
        if (line.startsWith("^")) {
          // This is a oid for the commit associated with the annotated tag immediately preceding this line.
          // Trim off the '^'
          const value = line.slice(1);
          // The tagname^{} syntax is based on the output of `git show-ref --tags -d`
          refs.set(key + "^{}", value);
          return { line, ref: key, peeled: value };
        } else {
          // This is an oid followed by the ref name
          const value = line.slice(0, i);
          key = line.slice(i + 1);
          refs.set(key, value);
          return { line, ref: key, oid: value };
        }
      });
  }

  return { refs, parsedConfig };
}

interface Remote {
  remote: string;
  url: string;
}

function listRemotes({ gitdir }: { gitdir: string }): Remote[] {
  gitdir = path.join(gitdir, ".git");
  const config = getConfig(gitdir);
  const remoteNames = getSubsections(config, "remote");
  const remotes = remoteNames.map((remote: string) => {
    const url = getConfigValue(config, `remote.${remote}.url`);
    return { remote, url };
  });
  return remotes;
}

// This is straight from parse_unit_factor in config.c of canonical git
const num = (val: any) => {
  if (typeof val === "number") {
    return val;
  }

  val = val.toLowerCase();
  let n = parseInt(val);
  if (val.endsWith("k")) n *= 1024;
  if (val.endsWith("m")) n *= 1024 * 1024;
  if (val.endsWith("g")) n *= 1024 * 1024 * 1024;
  return n;
};

// This is straight from git_parse_maybe_bool_text in config.c of canonical git
const bool = (val: any) => {
  if (typeof val === "boolean") {
    return val;
  }

  val = val.trim().toLowerCase();
  if (val === "true" || val === "yes" || val === "on") return true;
  if (val === "false" || val === "no" || val === "off") return false;
  throw Error(
    `Expected 'true', 'false', 'yes', 'no', 'on', or 'off', but got ${val}`
  );
};

const schema = {
  core: {
    filemode: bool,
    bare: bool,
    logallrefupdates: bool,
    symlinks: bool,
    ignorecase: bool,
    bigFileThreshold: num,
  },
};

function getConfigValue(parsedconfig: any, path: string, getall = false) {
  const normalizedPath = normalizePath(path).path;
  const allValues = parsedconfig
    .filter((config: any) => config.path === normalizedPath)
    // @ts-ignore

    .map(({ section, name, value }) => {
      // @ts-ignore

      const fn = schema[section] && schema[section][name];
      return fn ? fn(value) : value;
    });
  return getall ? allValues : allValues.pop();
}

function getSubsections(parsedConfig: any, section: string) {
  return parsedConfig
    .filter((config: any) => config.isSection && config.section === section)
    .map((config: any) => config.subsection);
}

const normalizePath = (path: string) => {
  const pathSegments = path.split(".");
  const section = pathSegments.shift();
  const name = pathSegments.pop();
  const subsection = pathSegments.length ? pathSegments.join(".") : undefined;

  return {
    section,
    subsection,
    name,
    // @ts-ignore

    path: getPath(section, subsection, name),
    // @ts-ignore

    sectionPath: getPath(section, subsection, null),
    isSection: !!section,
  };
};

export { listRemotes, resolveRef };
