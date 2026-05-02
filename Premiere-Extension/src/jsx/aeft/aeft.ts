// ==============================================================================
// UTILS & POLYFILLS
// ==============================================================================

export function logMessage(message: string): void {
  const now = new Date();
  const timeStr = now.getHours() + ":" + now.getMinutes() + ":" + now.getSeconds();
  $.writeln("[AutoSubs AE " + timeStr + "] " + message);
}

// ==============================================================================
// COMPOSITION MODULE
// ==============================================================================

function getActiveComp() {
  if (app.project.activeItem instanceof CompItem) {
    return app.project.activeItem;
  }
  return null;
}

export function getActiveSequenceInfo(): string {
  try {
    const comp = getActiveComp();
    if (!comp) {
      return JSON.stringify({
        success: false,
        error: "No active composition found",
        hasActiveSequence: false,
      });
    }

    const audioTrackInfo: any[] = [];
    let audioTrackCount = 0;

    // In AE, layers act as tracks. We'll just count layers that have audio
    for (var i = 1; i <= comp.numLayers; i++) {
      var layer = comp.layers[i];
      if (layer.hasAudio && layer.audioEnabled) {
        audioTrackCount++;
        audioTrackInfo.push({
          index: i,
          name: layer.name || "Layer " + i,
          enabled: true,
        });
      }
    }

    return JSON.stringify({
      success: true,
      hasActiveSequence: true,
      name: comp.name,
      id: comp.id.toString(),
      durationSeconds: comp.duration,
      timebase: 1 / comp.frameDuration,
      width: comp.width,
      height: comp.height,
      numAudioTracks: audioTrackCount,
      numVideoTracks: comp.numLayers,
      audioTrackInfo: audioTrackInfo,
    });
  } catch (e: any) {
    return JSON.stringify({
      success: false,
      error: "Error getting comp info: " + e.toString(),
      hasActiveSequence: false,
    });
  }
}

export function getSelectedClipsTimeRange(sequence: any) {
  try {
    const comp = getActiveComp();
    if (!comp) {
      return { success: false, error: "No active composition" };
    }

    var earliestStart = 999999999;
    var latestEnd = 0;
    var selectedClipsFound = 0;

    var selectedLayers = comp.selectedLayers;
    if (!selectedLayers || selectedLayers.length === 0) {
      return { success: false, error: "No layers are currently selected" };
    }

    for (var i = 0; i < selectedLayers.length; i++) {
      var layer = selectedLayers[i];
      selectedClipsFound++;
      var startTime = layer.inPoint;
      var endTime = layer.outPoint;

      if (startTime < earliestStart) earliestStart = startTime;
      if (endTime > latestEnd) latestEnd = endTime;
    }

    return {
      success: true,
      startTime: earliestStart,
      endTime: latestEnd,
      clipCount: selectedClipsFound,
    };
  } catch (e: any) {
    return { success: false, error: e.toString() };
  }
}

// ==============================================================================
// AUDIO EXPORT MODULE
// ==============================================================================

export function exportSequenceAudio(
  outputFolder: string,
  selectedTracksJson: string,
  selectedRange: string,
  externalPresetPath: string
): string {
  try {
    logMessage("=== EXPORT SEQUENCE AUDIO IN AE ===");
    const activeComp = getActiveComp();
    if (!activeComp) {
      return JSON.stringify({ success: false, error: "No active comp" });
    }

    // Check if there are audio layers
    var hasAudio = false;
    for (var i = 1; i <= activeComp.numLayers; i++) {
      if (activeComp.layers[i].hasAudio && activeComp.layers[i].audioEnabled) {
        hasAudio = true;
        break;
      }
    }
    if (!hasAudio) {
      return JSON.stringify({ success: false, error: "No audio layers in comp" });
    }

    var timestamp = new Date().getTime();
    var compName = activeComp.name.replace(/[^a-zA-Z0-9]/g, "_");
    var filename = compName + "_audio_" + timestamp + ".wav";

    var outputFolderObj = new Folder(outputFolder);
    if (!outputFolderObj.exists) {
      outputFolderObj.create();
    }

    var outputPath = outputFolderObj.fsName + "/" + filename;

    var renderQueue = app.project.renderQueue;
    renderQueue.items.add(activeComp);
    var lastIndex = renderQueue.numItems;
    var rqItem = renderQueue.item(lastIndex);

    // Apply WAV template
    // Note: The user must have a "WAV" template in their AE Render Queue templates.
    // If not, this might fail or render the default.
    rqItem.outputModule(1).applyTemplate("WAV");
    rqItem.outputModule(1).file = new File(outputPath);

    // Range handling
    var rangeType = (selectedRange || "entire").toLowerCase();
    var timeOffsetSeconds = 0;

    var originalStart = activeComp.workAreaStart;
    var originalDuration = activeComp.workAreaDuration;

    if (rangeType === "entire") {
      activeComp.workAreaStart = 0;
      activeComp.workAreaDuration = activeComp.duration;
    } else if (rangeType === "inout") {
      timeOffsetSeconds = activeComp.workAreaStart;
    } else if (rangeType === "selected" || rangeType === "selection") {
      var selectionRange = getSelectedClipsTimeRange(null);
      if (selectionRange.success) {
        timeOffsetSeconds = selectionRange.startTime || 0;
        activeComp.workAreaStart = timeOffsetSeconds;
        activeComp.workAreaDuration = (selectionRange.endTime || 0) - timeOffsetSeconds;
      } else {
        activeComp.workAreaStart = 0;
        activeComp.workAreaDuration = activeComp.duration;
      }
    }

    logMessage("Exporting wave to " + outputPath);
    renderQueue.render();

    var status = rqItem.status;

    // Cleanup the render queue item
    try {
      rqItem.remove();
    } catch (_) { }

    // Restore work area if we changed it for export
    if (rangeType === "entire" || rangeType === "selected" || rangeType === "selection") {
      activeComp.workAreaStart = originalStart;
      activeComp.workAreaDuration = originalDuration;
    }

    if (status === RQItemStatus.DONE) {
      logMessage("Audio exported successfully: " + outputPath);
      return JSON.stringify({
        success: true,
        outputPath: outputPath,
        filename: filename,
        timeOffsetSeconds: timeOffsetSeconds
      });
    } else {
      return JSON.stringify({ success: false, error: "Export failed or was cancelled" });
    }
  } catch (e: any) {
    return JSON.stringify({ success: false, error: e.toString() });
  }
}

// ==============================================================================
// SUBTITLES / CAPTIONS MODULE
// ==============================================================================

function parseTimecode(timecodeString: string, separator: string): number | null {
  try {
    var timeComponents = timecodeString.split(separator);
    if (timeComponents.length < 2) return null;

    var hhmmss = timeComponents[0].split(":");
    var hours = parseInt(hhmmss[0], 10);
    var minutes = parseInt(hhmmss[1], 10);
    var seconds = parseInt(hhmmss[2], 10);

    var millisecondsStr = timeComponents[1] || "0";
    var milliseconds = parseInt(millisecondsStr, 10);

    if (millisecondsStr.length === 2) {
      milliseconds *= 10;
    } else if (millisecondsStr.length === 1) {
      milliseconds *= 100;
    }

    return ((hours * 3600) + (minutes * 60) + seconds) * 1000 + milliseconds;
  } catch (err) {
    return null;
  }
}

function parseSrtContent(contentStr: string) {
  var lines = contentStr.split(/\r?\n/);
  var subtitles = [];
  var totalLines = lines.length;

  for (var i = 0; i < totalLines; i++) {
    var line = lines[i].replace(/^\s+|\s+$/g, "");
    if (!/^\d{2}:\d{2}:\d{1,2},\d{1,3} --> \d{2}:\d{2}:\d{1,2},\d{1,3}$/.test(line)) {
      continue;
    }

    var timecodes = line.split(" --> ");
    var startTime = parseTimecode(timecodes[0], ",");
    var endTime = parseTimecode(timecodes[1], ",");

    if (startTime !== null && endTime !== null) {
      var textLines = [];
      var lineIndex = i + 1;

      while (lineIndex < totalLines && lines[lineIndex] !== "") {
        // Strip HTML tags if any
        var cleanLine = lines[lineIndex].replace(/<\/?[^>]+(>|$)/g, "");
        textLines.push(cleanLine);
        lineIndex++;
      }

      subtitles.push({
        startTime: startTime,
        endTime: endTime,
        text: textLines.join("\n")
      });
      i = lineIndex;
    }
  }
  return subtitles;
}

export function importSRTFile(filePath: string): string {
  try {
    const comp = getActiveComp();
    if (!comp) {
      return JSON.stringify({ success: false, error: "No active composition" });
    }

    var srtFile = new File(filePath);
    if (!srtFile.exists) {
      return JSON.stringify({ success: false, error: "SRT file not found" });
    }

    srtFile.open("r");
    srtFile.encoding = "UTF-8";
    var content = srtFile.read();
    srtFile.close();

    var subtitles = parseSrtContent(content);
    if (subtitles.length === 0) {
      return JSON.stringify({ success: false, error: "No subtitles found or invalid SRT format" });
    }

    app.beginUndoGroup("Import SRT Subtitles");

    var boxWidth = comp.width * 0.8;
    var boxHeight = comp.height * 0.2; // roughly lower third

    var layersCreated = 0;

    for (var i = 0; i < subtitles.length; i++) {
      var sub = subtitles[i];
      var inSeconds = sub.startTime / 1000;
      var outSeconds = sub.endTime / 1000;

      // Create a BoxText layer
      var textLayer = comp.layers.addBoxText([boxWidth, boxHeight]);
      var textProp = textLayer.property("Source Text") as Property;
      var textDoc = textProp.value as TextDocument;

      textDoc.text = sub.text;
      textDoc.justification = ParagraphJustification.CENTER_JUSTIFY;
      textDoc.fontSize = Math.floor(comp.height * 0.05); // Responsive font size
      textDoc.fillColor = [1, 1, 1]; // White
      textDoc.applyStroke = true;
      textDoc.strokeColor = [0, 0, 0]; // Black
      textDoc.strokeWidth = 2;
      textProp.setValue(textDoc);

      textLayer.name = sub.text.replace(/\n/g, " ").substring(0, 30);

      textLayer.startTime = inSeconds;
      textLayer.inPoint = inSeconds;
      textLayer.outPoint = outSeconds;

      // Center the anchor point in the box
      textLayer.property("Anchor Point").setValue([boxWidth / 2, boxHeight / 2]);

      // Position in the lower center
      var transform = textLayer.property("Transform") as PropertyGroup;
      var position = transform.property("Position") as Property;
      position.setValue([comp.width / 2, comp.height * 0.85]);

      layersCreated++;
    }

    app.endUndoGroup();

    return JSON.stringify({
      success: true,
      method: "addTextLayers",
      itemName: "Created " + layersCreated + " Text Layers",
      layersCreated: layersCreated
    });

  } catch (e: any) {
    return JSON.stringify({ success: false, error: e.toString() });
  }
}
