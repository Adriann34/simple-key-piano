import MidiParser from 'midi-parser-js';
import { MidiData, MidiNote } from '../types/midi';

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// Krumhansl-Schmuckler key detection algorithm weights
const MAJOR_KEY_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR_KEY_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

interface KeySignature {
  key: string;
  mode: 'major' | 'minor';
  sharps: number;
  confidence: number;
}

interface TimeSignatureData {
  numerator: number;
  denominator: number;
  confidence: number;
}

// Advanced quantization with tolerance and musical intelligence
interface QuantizationResult {
  quantizedTime: number;
  originalTime: number;
  confidence: number;
  noteValue: string;
}

// Voice analysis for intelligent separation
interface VoiceAnalysisResult {
  voiceId: number;
  preferredClef: 'treble' | 'bass';
  averagePitch: number;
  rhythmicComplexity: number;
}

export const parseMidiFile = (file: File): Promise<MidiData> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (event) => {
      try {
        const arrayBuffer = event.target?.result as ArrayBuffer;
        const uint8Array = new Uint8Array(arrayBuffer);
        const midiData = MidiParser.parse(uint8Array);
        
        const notes: MidiNote[] = [];
        let currentTime = 0;
        const noteOnEvents: { [key: number]: { time: number; velocity: number; track: number } } = {};
        let timeSignature = { numerator: 4, denominator: 4 };
        let timeSignatureFound = false;
        let keySignature = 0;
        let keySignatureFound = false;
        let tempoChanges: Array<{ time: number; tempo: number }> = [];
        
        // Extract all MIDI events with enhanced parsing
        midiData.track.forEach((track, trackIndex) => {
          currentTime = 0;
          
          track.event.forEach((event) => {
            currentTime += event.deltaTime;
            
            // Note On events
            if (event.type === 9 && event.data && event.data.length >= 2) {
              const noteNumber = event.data[0];
              const velocity = event.data[1];
              
              if (velocity > 0) {
                noteOnEvents[noteNumber] = {
                  time: currentTime,
                  velocity,
                  track: trackIndex
                };
              } else {
                // Velocity 0 treated as note off
                if (noteOnEvents[noteNumber]) {
                  const noteOn = noteOnEvents[noteNumber];
                  const duration = currentTime - noteOn.time;
                  
                  notes.push({
                    noteNumber,
                    noteName: getNoteName(noteNumber),
                    velocity: noteOn.velocity,
                    startTime: noteOn.time,
                    duration,
                    track: noteOn.track
                  });
                  
                  delete noteOnEvents[noteNumber];
                }
              }
            }
            // Note Off events
            else if (event.type === 8 && event.data && event.data.length >= 2) {
              const noteNumber = event.data[0];
              
              if (noteOnEvents[noteNumber]) {
                const noteOn = noteOnEvents[noteNumber];
                const duration = currentTime - noteOn.time;
                
                notes.push({
                  noteNumber,
                  noteName: getNoteName(noteNumber),
                  velocity: noteOn.velocity,
                  startTime: noteOn.time,
                  duration,
                  track: noteOn.track
                });
                
                delete noteOnEvents[noteNumber];
              }
            }
            // Enhanced Meta events parsing
            else if (event.type === 255 && event.data && event.data.length > 0) {
              // Time signature (0x58)
              if (event.data[0] === 0x58 && event.data.length >= 5) {
                const numerator = event.data[2];
                const denominatorPower = event.data[3];
                const denominator = Math.pow(2, denominatorPower);
                
                timeSignature = {
                  numerator: numerator,
                  denominator: denominator
                };
                timeSignatureFound = true;
                
                console.log(`Time signature found: ${numerator}/${denominator}`);
              }
              // Key signature (0x59)
              else if (event.data[0] === 0x59 && event.data.length >= 3) {
                keySignature = event.data[2];
                keySignatureFound = true;
                
                console.log(`Key signature found: ${keySignature} sharps/flats`);
              }
              // Tempo (0x51)
              else if (event.data[0] === 0x51 && event.data.length >= 4) {
                const microsecondsPerQuarter = (event.data[2] << 16) | (event.data[3] << 8) | event.data[4];
                const bpm = 60000000 / microsecondsPerQuarter;
                tempoChanges.push({ time: currentTime, tempo: bpm });
                
                console.log(`Tempo found: ${bpm} BPM`);
              }
            }
          });
        });
        
        // Sort notes by start time
        notes.sort((a, b) => a.startTime - b.startTime);
        
        // Apply advanced quantization
        const quantizedNotes = applyAdvancedQuantization(notes, midiData.timeDivision, timeSignature);
        
        // Intelligent key detection if not found in MIDI
        const detectedKey = keySignatureFound ? parseKeySignature(keySignature) : detectKeySignature(quantizedNotes);
        
        // Use detected time signature or fallback to intelligent detection
        const detectedTimeSignature = timeSignatureFound 
          ? { ...timeSignature, confidence: 1.0 }
          : detectTimeSignature(quantizedNotes, midiData.timeDivision);
        
        console.log('Final time signature:', detectedTimeSignature);
        
        resolve({
          notes: quantizedNotes,
          ticksPerQuarter: midiData.timeDivision,
          timeSignature: {
            numerator: detectedTimeSignature.numerator,
            denominator: detectedTimeSignature.denominator
          },
          keySignature: detectedKey.sharps,
          keyName: detectedKey.key,
          keyMode: detectedKey.mode,
          tempoChanges,
          confidence: {
            key: detectedKey.confidence,
            timeSignature: detectedTimeSignature.confidence || 1.0
          }
        });
      } catch (error) {
        console.error('MIDI parsing error:', error);
        reject(error);
      }
    };
    
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsArrayBuffer(file);
  });
};

// Advanced quantization algorithm with tolerance and musical intelligence
function applyAdvancedQuantization(
  notes: MidiNote[], 
  ticksPerQuarter: number, 
  timeSignature: { numerator: number; denominator: number }
): MidiNote[] {
  // Define quantization grid based on time signature
  const quantizationLevels = getQuantizationLevels(ticksPerQuarter, timeSignature);
  
  return notes.map(note => {
    const quantizeResult = quantizeNoteWithTolerance(
      note.startTime, 
      note.duration, 
      quantizationLevels, 
      ticksPerQuarter
    );
    
    return {
      ...note,
      startTime: quantizeResult.quantizedTime,
      duration: quantizeDuration(note.duration, quantizationLevels, ticksPerQuarter)
    };
  });
}

// Get quantization levels based on musical context
function getQuantizationLevels(ticksPerQuarter: number, timeSignature: { numerator: number; denominator: number }): number[] {
  const levels: number[] = [];
  
  // Base note values
  const wholeNote = ticksPerQuarter * 4;
  const halfNote = ticksPerQuarter * 2;
  const quarterNote = ticksPerQuarter;
  const eighthNote = ticksPerQuarter / 2;
  const sixteenthNote = ticksPerQuarter / 4;
  const thirtySecondNote = ticksPerQuarter / 8;
  
  // Add basic levels
  levels.push(wholeNote, halfNote, quarterNote, eighthNote, sixteenthNote, thirtySecondNote);
  
  // Add triplet levels for compound time signatures
  if (timeSignature.numerator % 3 === 0 || timeSignature.denominator === 8) {
    levels.push(
      quarterNote * 2 / 3,  // Half note triplet
      quarterNote / 3,      // Eighth note triplet
      eighthNote / 3        // Sixteenth note triplet
    );
  }
  
  // Add dotted note values
  levels.push(
    quarterNote * 1.5,    // Dotted quarter
    eighthNote * 1.5,     // Dotted eighth
    sixteenthNote * 1.5   // Dotted sixteenth
  );
  
  return levels.sort((a, b) => a - b);
}

// Quantize note timing with tolerance and musical intelligence
function quantizeNoteWithTolerance(
  startTime: number, 
  duration: number, 
  quantizationLevels: number[], 
  ticksPerQuarter: number
): QuantizationResult {
  const tolerance = ticksPerQuarter / 16; // Sixteenth note tolerance
  
  // Find closest quantization point
  let bestQuantizedTime = startTime;
  let minDistance = Infinity;
  let confidence = 0;
  
  // Check against measure boundaries and beat positions
  const measureLength = ticksPerQuarter * 4; // Assuming 4/4 for simplicity
  const measureStart = Math.floor(startTime / measureLength) * measureLength;
  
  for (let i = 0; i < 16; i++) { // Check 16 subdivisions per measure
    const gridPoint = measureStart + (measureLength * i / 16);
    const distance = Math.abs(startTime - gridPoint);
    
    if (distance < minDistance && distance <= tolerance) {
      minDistance = distance;
      bestQuantizedTime = gridPoint;
      confidence = 1 - (distance / tolerance);
    }
  }
  
  // If no good quantization found, use original timing
  if (confidence < 0.3) {
    bestQuantizedTime = startTime;
    confidence = 0;
  }
  
  return {
    quantizedTime: bestQuantizedTime,
    originalTime: startTime,
    confidence: confidence,
    noteValue: getNoteValueFromDuration(duration, ticksPerQuarter)
  };
}

// Quantize note duration to standard musical values
function quantizeDuration(duration: number, quantizationLevels: number[], ticksPerQuarter: number): number {
  let bestDuration = duration;
  let minDistance = Infinity;
  
  quantizationLevels.forEach(level => {
    const distance = Math.abs(duration - level);
    if (distance < minDistance) {
      minDistance = distance;
      bestDuration = level;
    }
  });
  
  // Ensure minimum duration
  const minDuration = ticksPerQuarter / 32; // Thirty-second note minimum
  return Math.max(bestDuration, minDuration);
}

// Get note value string from duration
function getNoteValueFromDuration(duration: number, ticksPerQuarter: number): string {
  const ratio = duration / ticksPerQuarter;
  
  if (ratio >= 3.75) return 'whole';
  if (ratio >= 1.875) return 'half';
  if (ratio >= 0.9375) return 'quarter';
  if (ratio >= 0.46875) return 'eighth';
  if (ratio >= 0.234375) return 'sixteenth';
  return 'thirty-second';
}

// Analyze voices for intelligent separation
function analyzeVoices(notes: MidiNote[]): VoiceAnalysisResult[] {
  const voices: Map<number, MidiNote[]> = new Map();
  
  // Group notes by simultaneous timing (potential voices)
  notes.forEach(note => {
    const timeKey = Math.round(note.startTime / 10) * 10; // 10-tick tolerance
    if (!voices.has(timeKey)) {
      voices.set(timeKey, []);
    }
    voices.get(timeKey)!.push(note);
  });
  
  // Analyze each voice
  const voiceAnalysis: VoiceAnalysisResult[] = [];
  let voiceId = 0;
  
  voices.forEach(voiceNotes => {
    if (voiceNotes.length > 0) {
      const averagePitch = voiceNotes.reduce((sum, note) => sum + note.noteNumber, 0) / voiceNotes.length;
      const preferredClef = averagePitch >= 60 ? 'treble' : 'bass'; // Middle C split
      
      // Calculate rhythmic complexity
      const durations = voiceNotes.map(note => note.duration);
      const uniqueDurations = new Set(durations).size;
      const rhythmicComplexity = uniqueDurations / voiceNotes.length;
      
      voiceAnalysis.push({
        voiceId: voiceId++,
        preferredClef,
        averagePitch,
        rhythmicComplexity
      });
    }
  });
  
  return voiceAnalysis;
}

// Enhanced time signature detection with pattern recognition
function detectTimeSignature(notes: MidiNote[], ticksPerQuarter: number): TimeSignatureData {
  if (notes.length === 0) return { numerator: 4, denominator: 4, confidence: 0.5 };
  
  // Analyze beat patterns by looking at note onset times
  const onsetTimes = notes.map(note => note.startTime).sort((a, b) => a - b);
  const intervals: number[] = [];
  
  // Calculate intervals between consecutive note onsets
  for (let i = 1; i < Math.min(onsetTimes.length, 200); i++) {
    const interval = onsetTimes[i] - onsetTimes[i-1];
    if (interval > 0) {
      intervals.push(interval);
    }
  }
  
  if (intervals.length === 0) return { numerator: 4, denominator: 4, confidence: 0.5 };
  
  // Advanced pattern analysis
  const beatPatterns = analyzeBeatPatterns(intervals, ticksPerQuarter);
  const timeSignatureCandidate = detectTimeSignatureFromPatterns(beatPatterns);
  
  return timeSignatureCandidate;
}

// Analyze beat patterns for time signature detection
function analyzeBeatPatterns(intervals: number[], ticksPerQuarter: number): Map<string, number> {
  const patterns = new Map<string, number>();
  
  // Quantize intervals to standard note values
  intervals.forEach(interval => {
    const noteValue = getNoteValueFromDuration(interval, ticksPerQuarter);
    patterns.set(noteValue, (patterns.get(noteValue) || 0) + 1);
  });
  
  return patterns;
}

// Detect time signature from beat patterns
function detectTimeSignatureFromPatterns(patterns: Map<string, number>): TimeSignatureData {
  const totalCount = Array.from(patterns.values()).reduce((sum, count) => sum + count, 0);
  
  // Calculate percentages
  const quarterPercentage = (patterns.get('quarter') || 0) / totalCount;
  const eighthPercentage = (patterns.get('eighth') || 0) / totalCount;
  const halfPercentage = (patterns.get('half') || 0) / totalCount;
  const sixteenthPercentage = (patterns.get('sixteenth') || 0) / totalCount;
  
  // Advanced heuristics for time signature detection
  if (eighthPercentage > 0.5 && quarterPercentage < 0.3) {
    // Lots of eighth notes suggest compound time
    if (sixteenthPercentage > 0.2) {
      return { numerator: 6, denominator: 8, confidence: 0.8 };
    } else {
      return { numerator: 9, denominator: 8, confidence: 0.7 };
    }
  } else if (quarterPercentage > 0.4) {
    // Quarter note emphasis suggests simple time
    if (halfPercentage > 0.25) {
      return { numerator: 2, denominator: 4, confidence: 0.75 };
    } else if (eighthPercentage > 0.3) {
      return { numerator: 4, denominator: 4, confidence: 0.8 };
    } else {
      return { numerator: 3, denominator: 4, confidence: 0.7 };
    }
  } else if (halfPercentage > 0.4) {
    // Half note emphasis suggests slow tempo or 2/2 time
    return { numerator: 2, denominator: 2, confidence: 0.7 };
  }
  
  // Default fallback
  return { numerator: 4, denominator: 4, confidence: 0.6 };
}

// Rest of the functions remain the same...
function calculateCorrelation(chromaVector: number[], profile: number[], tonic: number): number {
  let correlation = 0;
  for (let i = 0; i < 12; i++) {
    const shiftedIndex = (i + tonic) % 12;
    correlation += chromaVector[shiftedIndex] * profile[i];
  }
  return correlation;
}

function getKeySignatureSharps(key: string, mode: 'major' | 'minor'): number {
  const majorKeys: { [key: string]: number } = {
    'C': 0, 'G': 1, 'D': 2, 'A': 3, 'E': 4, 'B': 5, 'F#': 6, 'C#': 7,
    'F': -1, 'Bb': -2, 'Eb': -3, 'Ab': -4, 'Db': -5, 'Gb': -6, 'Cb': -7
  };
  
  const minorKeys: { [key: string]: number } = {
    'A': 0, 'E': 1, 'B': 2, 'F#': 3, 'C#': 4, 'G#': 5, 'D#': 6, 'A#': 7,
    'D': -1, 'G': -2, 'C': -3, 'F': -4, 'Bb': -5, 'Eb': -6, 'Ab': -7
  };
  
  return mode === 'major' ? (majorKeys[key] || 0) : (minorKeys[key] || 0);
}

function detectKeySignature(notes: MidiNote[]): KeySignature {
  const chromaVector = new Array(12).fill(0);
  let totalDuration = 0;
  
  notes.forEach(note => {
    const chroma = note.noteNumber % 12;
    const weight = note.duration * (note.velocity / 127);
    chromaVector[chroma] += weight;
    totalDuration += weight;
  });
  
  if (totalDuration > 0) {
    for (let i = 0; i < 12; i++) {
      chromaVector[i] /= totalDuration;
    }
  }
  
  let bestKey = '';
  let bestMode: 'major' | 'minor' = 'major';
  let bestCorrelation = -1;
  let bestSharps = 0;
  
  for (let tonic = 0; tonic < 12; tonic++) {
    const majorCorr = calculateCorrelation(chromaVector, MAJOR_KEY_PROFILE, tonic);
    if (majorCorr > bestCorrelation) {
      bestCorrelation = majorCorr;
      bestKey = NOTE_NAMES[tonic];
      bestMode = 'major';
      bestSharps = getKeySignatureSharps(bestKey, bestMode);
    }
    
    const minorCorr = calculateCorrelation(chromaVector, MINOR_KEY_PROFILE, tonic);
    if (minorCorr > bestCorrelation) {
      bestCorrelation = minorCorr;
      bestKey = NOTE_NAMES[tonic];
      bestMode = 'minor';
      bestSharps = getKeySignatureSharps(bestKey, bestMode);
    }
  }
  
  return {
    key: bestKey,
    mode: bestMode,
    sharps: bestSharps,
    confidence: Math.max(0, Math.min(1, bestCorrelation))
  };
}

function parseKeySignature(sharps: number): KeySignature {
  const sharpMajorKeys = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#'];
  const flatMajorKeys = ['C', 'F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Cb'];
  
  if (sharps >= 0 && sharps <= 7) {
    const key = sharpMajorKeys[sharps];
    return { key, mode: 'major', sharps, confidence: 1.0 };
  } else if (sharps < 0 && sharps >= -7) {
    const key = flatMajorKeys[-sharps];
    return { key, mode: 'major', sharps, confidence: 1.0 };
  } else {
    return { key: 'C', mode: 'major', sharps: 0, confidence: 0.5 };
  }
}

const getNoteName = (noteNumber: number): string => {
  const octave = Math.floor(noteNumber / 12) - 1;
  const noteIndex = noteNumber % 12;
  return NOTE_NAMES[noteIndex] + octave;
};