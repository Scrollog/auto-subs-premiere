// @include './lib/json2.js'

import { ns } from "../shared/shared";

import * as ppro from "./ppro/ppro";
import * as aeft from "./aeft/aeft";

//@ts-ignore
const host = typeof $ !== "undefined" ? $ : window;

// A safe way to get the app name since some versions of Adobe Apps broken BridgeTalk in various places (e.g. After Effects 24-25)
// in that case we have to do various checks per app to deterimine the app name

const getAppNameSafely = (): ApplicationName | "unknown" => {
  const compare = (a: string, b: string) => {
    return a.toLowerCase().indexOf(b.toLowerCase()) > -1;
  };
  const exists = (a: any) => typeof a !== "undefined";

  try {
    // 1. Direct check via app.name (common in AE)
    if (typeof app !== "undefined" && app.name) {
      const name = app.name.toLowerCase();
      if (compare(name, "after effects")) return "aftereffects";
      if (compare(name, "premiere")) return "premierepro";
    }

    // 2. BridgeTalk (standard but can be broken)
    if (typeof BridgeTalk !== "undefined" && BridgeTalk.appName) {
      return BridgeTalk.appName as ApplicationName;
    }

    // 3. Fallback checks
    if (typeof app !== "undefined") {
      if (exists(app.appName)) {
        const appName = app.appName.toLowerCase();
        if (compare(appName, "after effects")) return "aftereffects";
      }
    }
  } catch (e) {
    // ignore
  }
  return "unknown";
};

const detectedApp = getAppNameSafely();
$.writeln("[AutoSubs] Detected host app: " + detectedApp);

switch (detectedApp) {
  case "aftereffects":
  case "aftereffectsbeta":
    $.writeln("[AutoSubs] Mapping AEFT functions...");
    host[ns] = aeft;
    break;
  case "premierepro":
  case "premiereprobeta":
    $.writeln("[AutoSubs] Mapping PPRO functions...");
    host[ns] = ppro;
    break;
  default:
    // If we can't detect, but app object looks like AE, assume AE
    if (typeof app !== "undefined" && typeof CompItem !== "undefined") {
      $.writeln("[AutoSubs] Fallback to After Effects detection");
      host[ns] = aeft;
    } else {
      $.writeln("[AutoSubs] Could not determine app, functions might not be available");
    }
    break;
}

const empty = {};
// prettier-ignore
export type Scripts = typeof empty
  & typeof ppro
  & typeof aeft
  ;

// https://extendscript.docsforadobe.dev/interapplication-communication/bridgetalk-class.html?highlight=bridgetalk#appname
type ApplicationName =
  | "aftereffects"
  | "aftereffectsbeta"
  | "ame"
  | "amebeta"
  | "audition"
  | "auditionbeta"
  | "animate"
  | "animatebeta"
  | "bridge"
  | "bridgebeta"
  // | "flash"
  | "illustrator"
  | "illustratorbeta"
  | "indesign"
  | "indesignbeta"
  // | "indesignserver"
  | "photoshop"
  | "photoshopbeta"
  | "premierepro"
  | "premiereprobeta";
