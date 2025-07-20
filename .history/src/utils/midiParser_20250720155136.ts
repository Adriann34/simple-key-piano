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
        let timeSignatureFound = false;
        let keySignature = 0;
        let keySignatureFound = false;
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
            // Meta events - Fixed time signature extraction
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
                keySignature = event.data[2]; // Signed byte for sharps/flats
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
        
        // Intelligent key detection if not found in MIDI
        const detectedKey = keySignatureFound ? parseKeySignature(keySignature) : detectKeySignature(notes);
        
        // Use detected time signature or fallback to intelligent detection
        const detectedTimeSignature = timeSignatureFound 
          ? { ...timeSignature, confidence: 1.0 }
          : detectTimeSignature(notes, midiData.timeDivision);
        
        console.log('Final time signature:', detectedTimeSignature);
        
        resolve({
          notes,
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

// Enhanced time signature detection with better pattern recognition
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
  
  // Quantize intervals to common note values
  const quantizedIntervals: { [key: string]: number } = {};
  
  intervals.forEach(interval => {
    const wholeNote = ticksPerQuarter * 4;
    const halfNote = ticksPerQuarter * 2;
    const quarterNote = ticksPerQuarter;
    const eighthNote = ticksPerQuarter / 2;
    const sixteenthNote = ticksPerQuarter / 4;
    
    // Find closest quantized value
    const candidates = [
      { value: wholeNote, name: 'whole' },
      { value: halfNote, name: 'half' },
      { value: quarterNote, name: 'quarter' },
      { value: eighthNote, name: 'eighth' },
      { value: sixteenthNote, name: 'sixteenth' }
    ];
    
    let closest = candidates[0];
    let minDiff = Math.abs(interval - closest.value);
    
    candidates.forEach(candidate => {
      const diff = Math.abs(interval - candidate.value);
      if (diff < minDiff) {
        closest = candidate;
        minDiff = diff;
      }
    });
    
    // Only count if reasonably close to a standard note value
    if (minDiff < quarterNote * 0.3) {
      quantizedIntervals[closest.name] = (quantizedIntervals[closest.name] || 0) + 1;
    }
  });
  
  // Analyze patterns to determine time signature
  const totalQuantized = Object.values(quantizedIntervals).reduce((sum, count) => sum + count, 0);
  
  if (totalQuantized === 0) return { numerator: 4, denominator: 4, confidence: 0.5 };
  
  // Calculate percentages
  const quarterPercentage = (quantizedIntervals['quarter'] || 0) / totalQuantized;
  const eighthPercentage = (quantizedIntervals['eighth'] || 0) / totalQuantized;
  const halfPercentage = (quantizedIntervals['half'] || 0) / totalQuantized;
  
  // Determine most likely time signature based on interval patterns
  if (eighthPercentage > 0.4 && quarterPercentage < 0.3) {
    // Lots of eighth notes, likely compound time
    if (eighthPercentage > 0.6) {
      return { numerator: 6, denominator: 8, confidence: 0.8 }; // 6/8 time
    } else {
      return { numerator: 3, denominator: 8, confidence: 0.7 }; // 3/8 time
    }
  } else if (quarterPercentage > 0.4) {
    // Lots of quarter notes
    if (halfPercentage > 0.2) {
      return { numerator: 2, denominator: 4, confidence: 0.7 }; // 2/4 time
    } else {
      return { numerator: 4, denominator: 4, confidence: 0.8 }; // 4/4 time
    }
  } else if (halfPercentage > 0.3) {
    return { numerator: 3, denominator: 4, confidence: 0.7 }; // 3/4 time (waltz)
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
    // Invalid key signature, default to C major
    return { key: 'C', mode: 'major', sharps: 0, confidence: 0.5 };
  }
}

const getNoteName = (noteNumber: number): string => {
  const octave = Math.floor(noteNumber / 12) - 1;
  const noteIndex = noteNumber % 12;
  return NOTE_NAMES[noteIndex] + octave;
};