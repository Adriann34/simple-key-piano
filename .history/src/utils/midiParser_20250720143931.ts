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
        let keySignature = 0;
        let tempoChanges: Array<{ time: number; tempo: number }> = [];
        
        // Extract all MIDI events
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
            // Meta events
            else if (event.type === 255) {
              // Time signature
              if (event.data && event.data[0] === 88 && event.data.length >= 3) {
                timeSignature = {
                  numerator: event.data[1],
                  denominator: Math.pow(2, event.data[2])
                };
              }
              // Key signature
              else if (event.data && event.data[0] === 89 && event.data.length >= 2) {
                keySignature = event.data[1];
              }
              // Tempo
              else if (event.data && event.data[0] === 81 && event.data.length >= 4) {
                const microsecondsPerQuarter = (event.data[1] << 16) | (event.data[2] << 8) | event.data[3];
                const bpm = 60000000 / microsecondsPerQuarter;
                tempoChanges.push({ time: currentTime, tempo: bpm });
              }
            }
          });
        });
        
        // Sort notes by start time
        notes.sort((a, b) => a.startTime - b.startTime);
        
        // Intelligent key detection if not found in MIDI
        const detectedKey = keySignature === 0 ? detectKeySignature(notes) : parseKeySignature(keySignature);
        
        // Intelligent time signature detection if not found
        const detectedTimeSignature = timeSignature.numerator === 4 && timeSignature.denominator === 4 
          ? detectTimeSignature(notes, midiData.timeDivision) 
          : timeSignature;
        
        resolve({
          notes,
          ticksPerQuarter: midiData.timeDivision,
          timeSignature: detectedTimeSignature,
          keySignature: detectedKey.sharps,
          keyName: detectedKey.key,
          keyMode: detectedKey.mode,
          tempoChanges,
          confidence: {
            key: detectedKey.confidence,
            timeSignature: 1.0 // Simple confidence for now
          }
        });
      } catch (error) {
        reject(error);
      }
    };
    
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsArrayBuffer(file);
  });
};

// Krumhansl-Schmuckler key detection algorithm
function detectKeySignature(notes: MidiNote[]): KeySignature {
  const chromaVector = new Array(12).fill(0);
  let totalDuration = 0;
  
  // Calculate chroma vector weighted by duration and velocity
  notes.forEach(note => {
    const chroma = note.noteNumber % 12;
    const weight = note.duration * (note.velocity / 127);
    chromaVector[chroma] += weight;
    totalDuration += weight;
  });
  
  // Normalize chroma vector
  if (totalDuration > 0) {
    for (let i = 0; i < 12; i++) {
      chromaVector[i] /= totalDuration;
    }
  }
  
  let bestKey = '';
  let bestMode: 'major' | 'minor' = 'major';
  let bestCorrelation = -1;
  let bestSharps = 0;
  
  // Test all 24 major and minor keys
  for (let tonic = 0; tonic < 12; tonic++) {
    // Test major key
    const majorCorr = calculateCorrelation(chromaVector, MAJOR_KEY_PROFILE, tonic);
    if (majorCorr > bestCorrelation) {
      bestCorrelation = majorCorr;
      bestKey = NOTE_NAMES[tonic];
      bestMode = 'major';
      bestSharps = getKeySignatureSharps(bestKey, bestMode);
    }
    
    // Test minor key
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
    'C': 0, 'G': 1, 'D': 2, 'A': 3, 'E': 4, 'B': 5, 'F#': 6,
    'F': -1, 'Bb': -2, 'Eb': -3, 'Ab': -4, 'Db': -5, 'Gb': -6
  };
  
  const minorKeys: { [key: string]: number } = {
    'A': 0, 'E': 1, 'B': 2, 'F#': 3, 'C#': 4, 'G#': 5, 'D#': 6,
    'D': -1, 'G': -2, 'C': -3, 'F': -4, 'Bb': -5, 'Eb': -6
  };
  
  return mode === 'major' ? (majorKeys[key] || 0) : (minorKeys[key] || 0);
}

function detectTimeSignature(notes: MidiNote[], ticksPerQuarter: number): TimeSignatureData {
  if (notes.length === 0) return { numerator: 4, denominator: 4, confidence: 1.0 };
  
  // Analyze beat patterns by looking at note onset times
  const onsetTimes = notes.map(note => note.startTime).sort((a, b) => a - b);
  const intervals: number[] = [];
  
  for (let i = 1; i < onsetTimes.length && i < 100; i++) {
    intervals.push(onsetTimes[i] - onsetTimes[i-1]);
  }
  
  // Find most common interval (likely beat duration)
  const intervalCounts: { [key: number]: number } = {};
  intervals.forEach(interval => {
    const quantized = Math.round(interval / (ticksPerQuarter / 8)) * (ticksPerQuarter / 8);
    intervalCounts[quantized] = (intervalCounts[quantized] || 0) + 1;
  });
  
  const sortedIntervals = Object.entries(intervalCounts)
    .sort(([,a], [,b]) => b - a)
    .map(([interval]) => parseInt(interval));
  
  if (sortedIntervals.length === 0) return { numerator: 4, denominator: 4, confidence: 1.0 };
  
  const primaryInterval = sortedIntervals[0];
  const beatUnit = ticksPerQuarter * 4 / primaryInterval;
  
  // Determine likely time signatures based on beat patterns
  if (beatUnit >= 3.5 && beatUnit <= 4.5) return { numerator: 4, denominator: 4, confidence: 0.8 };
  if (beatUnit >= 2.5 && beatUnit <= 3.5) return { numerator: 3, denominator: 4, confidence: 0.7 };
  if (beatUnit >= 5.5 && beatUnit <= 6.5) return { numerator: 6, denominator: 8, confidence: 0.6 };
  
  return { numerator: 4, denominator: 4, confidence: 0.5 };
}

function parseKeySignature(sharps: number): KeySignature {
  const majorKeys = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#'];
  const flatMajorKeys = ['C', 'F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Cb'];
  
  if (sharps >= 0) {
    const key = majorKeys[Math.min(sharps, 7)];
    return { key, mode: 'major', sharps, confidence: 1.0 };
  } else {
    const key = flatMajorKeys[Math.min(-sharps, 7)];
    return { key, mode: 'major', sharps, confidence: 1.0 };
  }
}

const getNoteName = (noteNumber: number): string => {
  const octave = Math.floor(noteNumber / 12) - 1;
  const noteIndex = noteNumber % 12;
  return NOTE_NAMES[noteIndex] + octave;
};