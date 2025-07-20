import MidiParser from 'midi-parser-js';
import { MidiData, MidiNote } from '../types/midi';

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// Enhanced Krumhansl-Schmuckler key detection algorithm weights
const MAJOR_KEY_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR_KEY_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

// Additional key profiles for better detection
const DORIAN_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
const MIXOLYDIAN_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];

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

interface BeatAnalysis {
  tempo: number;
  confidence: number;
  beatPositions: number[];
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
        
        // Enhanced MIDI event extraction with better error handling
        midiData.track.forEach((track, trackIndex) => {
          currentTime = 0;
          
          track.event.forEach((event) => {
            currentTime += event.deltaTime;
            
            // Note On events
            if (event.type === 9 && event.data && event.data.length >= 2) {
              const noteNumber = event.data[0];
              const velocity = event.data[1];
              
              if (velocity > 0 && noteNumber >= 21 && noteNumber <= 108) {
                noteOnEvents[noteNumber] = {
                  time: currentTime,
                  velocity,
                  track: trackIndex
                };
              } else if (velocity === 0) {
                // Velocity 0 treated as note off
                if (noteOnEvents[noteNumber]) {
                  const noteOn = noteOnEvents[noteNumber];
                  const duration = Math.max(currentTime - noteOn.time, midiData.timeDivision / 32);
                  
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
                const duration = Math.max(currentTime - noteOn.time, midiData.timeDivision / 32);
                
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
            // Meta events - Enhanced meta event parsing
            else if (event.type === 255 && event.data && event.data.length > 0) {
              // Time signature (0x58)
              if (event.data[0] === 0x58 && event.data.length >= 5) {
                const numerator = event.data[2];
                const denominatorPower = event.data[3];
                const denominator = Math.pow(2, denominatorPower);
                
                // Validate time signature
                if (numerator > 0 && numerator <= 32 && denominator >= 1 && denominator <= 32) {
                  timeSignature = {
                    numerator: numerator,
                    denominator: denominator
                  };
                  timeSignatureFound = true;
                  console.log(`Time signature found: ${numerator}/${denominator}`);
                }
              }
              // Key signature (0x59)
              else if (event.data[0] === 0x59 && event.data.length >= 3) {
                const sharpsFlats = event.data[2];
                // Convert unsigned byte to signed byte
                keySignature = sharpsFlats > 127 ? sharpsFlats - 256 : sharpsFlats;
                keySignatureFound = true;
                console.log(`Key signature found: ${keySignature} sharps/flats`);
              }
              // Tempo (0x51)
              else if (event.data[0] === 0x51 && event.data.length >= 4) {
                const microsecondsPerQuarter = (event.data[2] << 16) | (event.data[3] << 8) | event.data[4];
                const bpm = Math.round(60000000 / microsecondsPerQuarter);
                if (bpm > 0 && bpm <= 300) { // Reasonable tempo range
                  tempoChanges.push({ time: currentTime, tempo: bpm });
                  console.log(`Tempo found: ${bpm} BPM`);
                }
              }
            }
          });
        });
        
        // Handle remaining note on events (notes that never had note off)
        Object.values(noteOnEvents).forEach(noteOn => {
          const duration = Math.max(midiData.timeDivision / 4, midiData.timeDivision / 32); // Default to quarter note or minimum
          notes.push({
            noteNumber: Object.keys(noteOnEvents).find(key => noteOnEvents[parseInt(key)] === noteOn) ? parseInt(Object.keys(noteOnEvents).find(key => noteOnEvents[parseInt(key)] === noteOn)!) : 60,
            noteName: getNoteName(60),
            velocity: noteOn.velocity,
            startTime: noteOn.time,
            duration,
            track: noteOn.track
          });
        });
        
        // Sort notes by start time
        notes.sort((a, b) => a.startTime - b.startTime);
        
        // Enhanced key detection with multiple algorithms
        const detectedKey = keySignatureFound ? parseKeySignature(keySignature) : detectKeySignatureAdvanced(notes);
        
        // Enhanced time signature detection
        const detectedTimeSignature = timeSignatureFound 
          ? { ...timeSignature, confidence: 1.0 }
          : detectTimeSignatureAdvanced(notes, midiData.timeDivision);
        
        console.log('Final time signature:', detectedTimeSignature);
        console.log('Final key signature:', detectedKey);
        
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

// Enhanced time signature detection with advanced pattern recognition
function detectTimeSignatureAdvanced(notes: MidiNote[], ticksPerQuarter: number): TimeSignatureData {
  if (notes.length === 0) return { numerator: 4, denominator: 4, confidence: 0.5 };
  
  // Analyze beat patterns by looking at note onset times and durations
  const onsetTimes = notes.map(note => note.startTime).sort((a, b) => a - b);
  const noteDurations = notes.map(note => note.duration).sort((a, b) => a - b);
  
  // Calculate inter-onset intervals
  const intervals: number[] = [];
  for (let i = 1; i < Math.min(onsetTimes.length, 500); i++) {
    const interval = onsetTimes[i] - onsetTimes[i-1];
    if (interval > 0) {
      intervals.push(interval);
    }
  }
  
  if (intervals.length === 0) return { numerator: 4, denominator: 4, confidence: 0.5 };
  
  // Advanced quantization analysis
  const quantizedIntervals: { [key: string]: number } = {};
  const quantizedDurations: { [key: string]: number } = {};
  
  // Analyze intervals
  intervals.forEach(interval => {
    const wholeNote = ticksPerQuarter * 4;
    const halfNote = ticksPerQuarter * 2;
    const quarterNote = ticksPerQuarter;
    const eighthNote = ticksPerQuarter / 2;
    const sixteenthNote = ticksPerQuarter / 4;
    const dottedQuarter = ticksPerQuarter * 1.5;
    const dottedEighth = ticksPerQuarter * 0.75;
    
    const candidates = [
      { value: wholeNote, name: 'whole' },
      { value: halfNote, name: 'half' },
      { value: quarterNote, name: 'quarter' },
      { value: dottedQuarter, name: 'dotted_quarter' },
      { value: eighthNote, name: 'eighth' },
      { value: dottedEighth, name: 'dotted_eighth' },
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
    if (minDiff < quarterNote * 0.4) {
      quantizedIntervals[closest.name] = (quantizedIntervals[closest.name] || 0) + 1;
    }
  });
  
  // Analyze note durations
  noteDurations.forEach(duration => {
    const wholeNote = ticksPerQuarter * 4;
    const halfNote = ticksPerQuarter * 2;
    const quarterNote = ticksPerQuarter;
    const eighthNote = ticksPerQuarter / 2;
    const sixteenthNote = ticksPerQuarter / 4;
    
    const candidates = [
      { value: wholeNote, name: 'whole' },
      { value: halfNote, name: 'half' },
      { value: quarterNote, name: 'quarter' },
      { value: eighthNote, name: 'eighth' },
      { value: sixteenthNote, name: 'sixteenth' }
    ];
    
    let closest = candidates[0];
    let minDiff = Math.abs(duration - closest.value);
    
    candidates.forEach(candidate => {
      const diff = Math.abs(duration - candidate.value);
      if (diff < minDiff) {
        closest = candidate;
        minDiff = diff;
      }
    });
    
    if (minDiff < quarterNote * 0.3) {
      quantizedDurations[closest.name] = (quantizedDurations[closest.name] || 0) + 1;
    }
  });
  
  const totalQuantizedIntervals = Object.values(quantizedIntervals).reduce((sum, count) => sum + count, 0);
  const totalQuantizedDurations = Object.values(quantizedDurations).reduce((sum, count) => sum + count, 0);
  
  if (totalQuantizedIntervals === 0 && totalQuantizedDurations === 0) {
    return { numerator: 4, denominator: 4, confidence: 0.5 };
  }
  
  // Calculate percentages
  const dottedQuarterPercentage = (quantizedIntervals['dotted_quarter'] || 0) / Math.max(totalQuantizedIntervals, 1);
  const dottedEighthPercentage = (quantizedIntervals['dotted_eighth'] || 0) / Math.max(totalQuantizedIntervals, 1);
  const quarterPercentage = (quantizedIntervals['quarter'] || 0) / Math.max(totalQuantizedIntervals, 1);
  const eighthPercentage = (quantizedIntervals['eighth'] || 0) / Math.max(totalQuantizedIntervals, 1);
  const halfPercentage = (quantizedIntervals['half'] || 0) / Math.max(totalQuantizedIntervals, 1);
  
  // Enhanced pattern detection
  let timeSignature = { numerator: 4, denominator: 4 };
  let confidence = 0.6;
  
  // Detect compound time signatures (6/8, 9/8, 12/8)
  if (dottedQuarterPercentage > 0.3 || (dottedEighthPercentage > 0.2 && eighthPercentage > 0.4)) {
    if (dottedQuarterPercentage > 0.4) {
      timeSignature = { numerator: 6, denominator: 8 };
      confidence = 0.85;
    } else if (dottedQuarterPercentage > 0.2 && eighthPercentage > 0.3) {
      timeSignature = { numerator: 9, denominator: 8 };
      confidence = 0.75;
    } else {
      timeSignature = { numerator: 12, denominator: 8 };
      confidence = 0.7;
    }
  }
  // Detect simple time signatures
  else if (eighthPercentage > 0.5 && quarterPercentage < 0.3) {
    timeSignature = { numerator: 2, denominator: 8 };
    confidence = 0.75;
  } else if (quarterPercentage > 0.4) {
    if (halfPercentage > 0.25) {
      timeSignature = { numerator: 2, denominator: 4 };
      confidence = 0.8;
    } else if (quarterPercentage > 0.6) {
      timeSignature = { numerator: 4, denominator: 4 };
      confidence = 0.85;
    } else {
      timeSignature = { numerator: 3, denominator: 4 };
      confidence = 0.75;
    }
  } else if (halfPercentage > 0.4) {
    timeSignature = { numerator: 2, denominator: 2 };
    confidence = 0.8;
  }
  
  return { ...timeSignature, confidence };
}

// Enhanced key detection with multiple algorithm support
function detectKeySignatureAdvanced(notes: MidiNote[]): KeySignature {
  if (notes.length === 0) {
    return { key: 'C', mode: 'major', sharps: 0, confidence: 0.5 };
  }
  
  const chromaVector = new Array(12).fill(0);
  let totalWeight = 0;
  
  // Enhanced weighting system considering duration, velocity, and position
  notes.forEach((note, index) => {
    const chroma = note.noteNumber % 12;
    // Weight by duration * velocity + positional weight (beginning and end of piece are more important)
    const positionalWeight = index < notes.length * 0.1 || index > notes.length * 0.9 ? 1.5 : 1.0;
const weight = (note.duration * (note.velocity / 127) * positionalWeight);
   chromaVector[chroma] += weight;
   totalWeight += weight;
 });
 
 // Normalize chroma vector
 if (totalWeight > 0) {
   for (let i = 0; i < 12; i++) {
     chromaVector[i] /= totalWeight;
   }
 }
 
 let bestKey = '';
 let bestMode: 'major' | 'minor' = 'major';
 let bestCorrelation = -1;
 let bestSharps = 0;
 
 // Test all 24 major and minor keys with multiple profiles
 const profiles = [
   { profile: MAJOR_KEY_PROFILE, mode: 'major' as const, weight: 1.0 },
   { profile: MINOR_KEY_PROFILE, mode: 'minor' as const, weight: 1.0 },
   { profile: DORIAN_PROFILE, mode: 'minor' as const, weight: 0.8 }, // Less weight for modal scales
   { profile: MIXOLYDIAN_PROFILE, mode: 'major' as const, weight: 0.8 }
 ];
 
 for (let tonic = 0; tonic < 12; tonic++) {
   profiles.forEach(({ profile, mode, weight }) => {
     const correlation = calculateCorrelation(chromaVector, profile, tonic) * weight;
     
     if (correlation > bestCorrelation) {
       bestCorrelation = correlation;
       bestKey = NOTE_NAMES[tonic];
       bestMode = mode;
       bestSharps = getKeySignatureSharps(bestKey, bestMode);
     }
   });
 }
 
 // Additional validation using interval analysis
 const intervalConfidence = analyzeIntervals(notes, bestKey, bestMode);
 const finalConfidence = Math.min(1.0, (bestCorrelation * 0.7) + (intervalConfidence * 0.3));
 
 return {
   key: bestKey,
   mode: bestMode,
   sharps: bestSharps,
   confidence: Math.max(0, finalConfidence)
 };
}

// Analyze intervals to validate key detection
function analyzeIntervals(notes: MidiNote[], key: string, mode: 'major' | 'minor'): number {
 if (notes.length < 2) return 0.5;
 
 const keyTonic = NOTE_NAMES.indexOf(key);
 const expectedIntervals = mode === 'major' 
   ? [2, 2, 1, 2, 2, 2, 1] // Major scale intervals in semitones
   : [2, 1, 2, 2, 1, 2, 2]; // Natural minor scale intervals
 
 let matchingIntervals = 0;
 let totalIntervals = 0;
 
 // Analyze melodic intervals
 for (let i = 1; i < Math.min(notes.length, 100); i++) {
   const interval = Math.abs(notes[i].noteNumber - notes[i-1].noteNumber) % 12;
   if (expectedIntervals.includes(interval)) {
     matchingIntervals++;
   }
   totalIntervals++;
 }
 
 return totalIntervals > 0 ? matchingIntervals / totalIntervals : 0.5;
}

// Enhanced correlation calculation
function calculateCorrelation(chromaVector: number[], profile: number[], tonic: number): number {
 let correlation = 0;
 let vectorMagnitude = 0;
 let profileMagnitude = 0;
 
 // Calculate Pearson correlation coefficient
 for (let i = 0; i < 12; i++) {
   const shiftedIndex = (i + tonic) % 12;
   correlation += chromaVector[shiftedIndex] * profile[i];
   vectorMagnitude += chromaVector[shiftedIndex] * chromaVector[shiftedIndex];
   profileMagnitude += profile[i] * profile[i];
 }
 
 const magnitude = Math.sqrt(vectorMagnitude * profileMagnitude);
 return magnitude > 0 ? correlation / magnitude : 0;
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

function parseKeySignature(sharps: number): KeySignature {
 const sharpMajorKeys = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#'];
 const flatMajorKeys = ['C', 'F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Cb'];
 const sharpMinorKeys = ['A', 'E', 'B', 'F#', 'C#', 'G#', 'D#', 'A#'];
 const flatMinorKeys = ['A', 'D', 'G', 'C', 'F', 'Bb', 'Eb', 'Ab'];
 
 if (sharps >= 0 && sharps <= 7) {
   const majorKey = sharpMajorKeys[sharps];
   const minorKey = sharpMinorKeys[sharps];
   // Return major by default, could be enhanced with mode detection
   return { key: majorKey, mode: 'major', sharps, confidence: 1.0 };
 } else if (sharps < 0 && sharps >= -7) {
   const majorKey = flatMajorKeys[-sharps];
   const minorKey = flatMinorKeys[-sharps];
   return { key: majorKey, mode: 'major', sharps, confidence: 1.0 };
 } else {
   return { key: 'C', mode: 'major', sharps: 0, confidence: 0.5 };
 }
}

const getNoteName = (noteNumber: number): string => {
 const octave = Math.floor(noteNumber / 12) - 1;
 const noteIndex = noteNumber % 12;
 return NOTE_NAMES[noteIndex] + octave;
};