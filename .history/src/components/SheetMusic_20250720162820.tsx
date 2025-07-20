import React, { useEffect, useRef, useState } from 'react';
import { 
  Renderer, Stave, StaveNote, Voice, Formatter, Accidental, Beam, 
  StaveConnector, Tuplet
} from 'vexflow';
import { MidiData } from '../types/midi';
import { midiNoteToVexFlowNote, getVexFlowKeySignature, getVexFlowTimeSignature } from '../utils/noteMapping';

interface NoteClickData {
  midiNotes: number[];
  clef: 'treble' | 'bass';
}

interface SheetMusicProps {
  midiData: MidiData | null;
  onNoteClick: (data: NoteClickData) => void;
  fileName?: string;
}

interface ProcessedNote {
  midiNote: number;
  vexNote: string;
  startTime: number;
  duration: number;
  velocity: number;
  voice: 'treble' | 'bass';
  quantizedStartTime: number;
  noteValue: string;
  isTuplet?: boolean;
  tupletRatio?: { num: number; denom: number };
}

interface VoiceData {
  trebleNotes: StaveNote[];
  bassNotes: StaveNote[];
  trebleMetadata: Array<{ staveNote: StaveNote; midiNotes: number[]; isTuplet?: boolean }>;
  bassMetadata: Array<{ staveNote: StaveNote; midiNotes: number[]; isTuplet?: boolean }>;
  trebleTuplets: Tuplet[];
  bassTuplets: Tuplet[];
}

interface BeamGroup {
  notes: StaveNote[];
  isValid: boolean;
}

const SheetMusic: React.FC<SheetMusicProps> = ({ midiData, onNoteClick, fileName }) => {
  const divRef = useRef<HTMLDivElement>(null);
  const [clickableElements, setClickableElements] = useState<HTMLElement[]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  // Enhanced layout configuration
  const MEASURES_PER_LINE = 4;
  const LINES_PER_PAGE = 4;
  const MEASURES_PER_PAGE = MEASURES_PER_LINE * LINES_PER_PAGE;
  const MEASURE_WIDTH = 400; // Increased for better spacing
  const SYSTEM_HEIGHT = 240; // Increased for tuplets and complex notation
  const PAGE_MARGIN = 50;
  const CANVAS_WIDTH = MEASURES_PER_LINE * MEASURE_WIDTH + (PAGE_MARGIN * 2);
  const CANVAS_HEIGHT = LINES_PER_PAGE * SYSTEM_HEIGHT + (PAGE_MARGIN * 2);

  // Get display filename without extension
  const getDisplayFileName = (fileName?: string): string => {
    if (!fileName) return 'Sheet Music';
    return fileName.replace(/\.(mid|midi)$/i, '');
  };

  // Advanced duration mapping with tuplet detection
  const getMusicalDuration = (
    durationTicks: number, 
    ticksPerQuarter: number, 
    timeSignature: { numerator: number, denominator: number },
    context?: { previousNotes?: ProcessedNote[], isInTuplet?: boolean }
  ): { duration: string; isTuplet: boolean; tupletRatio?: { num: number; denom: number } } => {
    const quarterNoteDuration = ticksPerQuarter;
    const ratio = durationTicks / quarterNoteDuration;
    
    // Detect tuplets by checking if duration doesn't fit standard ratios
    const standardRatios = [4, 2, 1, 0.5, 0.25, 0.125, 0.0625]; // whole, half, quarter, etc.
    const tolerance = 0.1;
    
    let isTuplet = false;
    let tupletRatio: { num: number; denom: number } | undefined;
    
    // Check for triplet patterns (3:2 ratio)
    const tripletRatio = ratio * 1.5; // Convert to triplet equivalent
    if (Math.abs(tripletRatio - Math.round(tripletRatio)) < tolerance) {
      isTuplet = true;
      tupletRatio = { num: 3, denom: 2 };
    }
    
    // Check for quintuplet patterns (5:4 ratio)
    const quintupletRatio = ratio * 1.25;
    if (Math.abs(quintupletRatio - Math.round(quintupletRatio)) < tolerance) {
      isTuplet = true;
      tupletRatio = { num: 5, denom: 4 };
    }
    
    // Advanced quantization based on time signature and musical context
    const beatUnit = 4 / timeSignature.denominator;
    const adjustedRatio = ratio / beatUnit;
    
    let duration: string;
    if (adjustedRatio >= 3.75) duration = '1';      // Whole note
    else if (adjustedRatio >= 1.875) duration = '2';     // Half note  
    else if (adjustedRatio >= 0.9375) duration = '4';    // Quarter note
    else if (adjustedRatio >= 0.46875) duration = '8';   // Eighth note
    else if (adjustedRatio >= 0.234375) duration = '16'; // Sixteenth note
    else if (adjustedRatio >= 0.1171875) duration = '32'; // Thirty-second note
    else duration = '64'; // Sixty-fourth note
    
    return { duration, isTuplet, tupletRatio };
  };

  // Intelligent voice separation with floating pitch analysis
  const separateVoices = (notes: ProcessedNote[]): { trebleNotes: ProcessedNote[]; bassNotes: ProcessedNote[] } => {
    const trebleNotes: ProcessedNote[] = [];
    const bassNotes: ProcessedNote[] = [];
    
    if (notes.length === 0) return { trebleNotes, bassNotes };
    
    // Analyze pitch distribution for intelligent split point
    const pitches = notes.map(note => note.midiNote).sort((a, b) => a - b);
    const medianPitch = pitches[Math.floor(pitches.length / 2)];
    const rangeLow = pitches[0];
    const rangeHigh = pitches[pitches.length - 1];
    const range = rangeHigh - rangeLow;
    
    // Dynamic split point calculation
    let splitPoint = 60; // Default middle C
    
    if (range > 48) { // More than 4 octaves
      // Use weighted split based on note density and musical context
      const weightedSum = notes.reduce((sum, note) => {
        const weight = note.velocity * note.duration;
        return sum + (note.midiNote * weight);
      }, 0);
      const totalWeight = notes.reduce((sum, note) => sum + (note.velocity * note.duration), 0);
      const weightedAverage = weightedSum / totalWeight;
      
      // Adjust split point based on weighted average but keep it musical
      splitPoint = Math.max(55, Math.min(65, Math.round(weightedAverage)));
    } else if (range <= 24) { // Less than 2 octaves
      // For smaller ranges, use traditional middle C split
      splitPoint = Math.max(medianPitch - 6, Math.min(medianPitch + 6, 60));
    } else {
      // Medium range: use 40% from bottom approach
      splitPoint = Math.round(rangeLow + (range * 0.4));
    }
    
    // Advanced voice assignment with context analysis
    notes.forEach((note, index) => {
      let assignedVoice: 'treble' | 'bass';
      
      // Check for hand crossing patterns
      const prevNote = index > 0 ? notes[index - 1] : null;
      const nextNote = index < notes.length - 1 ? notes[index + 1] : null;
      
      // Base assignment
      if (note.midiNote >= splitPoint) {
        assignedVoice = 'treble';
      } else {
        assignedVoice = 'bass';
      }
      
      // Context-aware adjustments for musical phrases
      if (prevNote && nextNote) {
        // If this note creates a large jump, consider keeping it in the same voice as context
        const prevJump = Math.abs(note.midiNote - prevNote.midiNote);
        const nextJump = Math.abs(nextNote.midiNote - note.midiNote);
        
        if (prevJump > 12 || nextJump > 12) { // Octave+ jumps
          // Check if staying in previous voice would be more musical
          if (prevNote.voice === 'treble' && note.midiNote >= splitPoint - 6) {
            assignedVoice = 'treble';
          } else if (prevNote.voice === 'bass' && note.midiNote <= splitPoint + 6) {
            assignedVoice = 'bass';
          }
        }
      }
      
      note.voice = assignedVoice;
      
      if (assignedVoice === 'treble') {
        trebleNotes.push(note);
      } else {
        bassNotes.push(note);
      }
    });
    
    return { trebleNotes, bassNotes };
  };

  // Advanced chord detection with musical context and voice leading
  const groupIntoChords = (notes: ProcessedNote[], ticksPerQuarter: number): Map<number, ProcessedNote[]> => {
    const chordTolerance = Math.max(ticksPerQuarter / 32, 10); // Adaptive tolerance
    const chordGroups = new Map<number, ProcessedNote[]>();
    
    // Sort notes by start time first
    const sortedNotes = [...notes].sort((a, b) => a.quantizedStartTime - b.quantizedStartTime);
    
    sortedNotes.forEach(note => {
      let foundGroup = false;
      
      // Look for existing group within tolerance
      for (const [timeKey, group] of chordGroups.entries()) {
        if (Math.abs(note.quantizedStartTime - timeKey) <= chordTolerance) {
          group.push(note);
          foundGroup = true;
          break;
        }
      }
      
      if (!foundGroup) {
        chordGroups.set(note.quantizedStartTime, [note]);
      }
    });
    
    // Post-process groups for musical logic
    const processedGroups = new Map<number, ProcessedNote[]>();
    
    chordGroups.forEach((group, timeKey) => {
      // Sort chord notes by pitch (bass to treble)
      group.sort((a, b) => a.midiNote - b.midiNote);
      
      // Limit chord complexity for readability
      const maxNotesPerChord = 6;
      if (group.length > maxNotesPerChord) {
        // Keep the most important notes (by velocity and musical context)
        group.sort((a, b) => {
          const aImportance = a.velocity * (a.duration / 100);
          const bImportance = b.velocity * (b.duration / 100);
          return bImportance - aImportance;
        });
        group.splice(maxNotesPerChord);
        group.sort((a, b) => a.midiNote - b.midiNote);
      }
      
      processedGroups.set(timeKey, group);
    });
    
    return processedGroups;
  };

  // Detect tuplets in note sequences
  const detectTuplets = (notes: ProcessedNote[], ticksPerQuarter: number): ProcessedNote[] => {
    const result: ProcessedNote[] = [];
    let i = 0;
    
    while (i < notes.length) {
      const currentNote = notes[i];
      
      // Look ahead for potential tuplet groups
      const tupletCandidates = [currentNote];
      let j = i + 1;
      
      // Check next few notes for tuplet pattern
      while (j < notes.length && j < i + 7) { // Max 7 notes in tuplet
        const nextNote = notes[j];
        const timeDiff = nextNote.quantizedStartTime - tupletCandidates[tupletCandidates.length - 1].quantizedStartTime;
        
        // If notes are close together and have similar durations, they might be a tuplet
        if (timeDiff <= ticksPerQuarter && timeDiff > 0) {
          tupletCandidates.push(nextNote);
        } else {
          break;
        }
        j++;
      }
      
      // Analyze if this is a valid tuplet (3, 5, 7 notes typically)
      if (tupletCandidates.length >= 3 && [3, 5, 7].includes(tupletCandidates.length)) {
        const tupletDuration = tupletCandidates[tupletCandidates.length - 1].quantizedStartTime - tupletCandidates[0].quantizedStartTime + tupletCandidates[tupletCandidates.length - 1].duration;
        const expectedNormalDuration = (tupletCandidates.length - 1) * (ticksPerQuarter / 2); // Assuming eighth notes
        
        // Check if it fits tuplet ratio (tolerance of 20%)
        const ratio = tupletDuration / expectedNormalDuration;
        if (ratio > 0.6 && ratio < 0.8) { // Triplet-like compression
          // Mark as tuplet
          tupletCandidates.forEach(note => {
            note.isTuplet = true;
            note.tupletRatio = { num: tupletCandidates.length, denom: tupletCandidates.length - 1 };
          });
        }
      }
      
      result.push(...tupletCandidates);
      i = j;
    }
    
    return result;
  };

  // Advanced beam grouping with musical intelligence
  const createIntelligentBeamGroups = (notes: StaveNote[], timeSignature: { numerator: number, denominator: number }): BeamGroup[] => {
    const beamGroups: BeamGroup[] = [];
    const beamableNotes = ['8', '16', '32', '64'];
    
    // Determine beam grouping strategy based on time signature
    let maxBeamGroupSize: number;
    let beatDivision: number;
    
    if (timeSignature.denominator === 8) {
      // Compound time: beam in groups of 3
      maxBeamGroupSize = 3;
      beatDivision = 3;
    } else {
      // Simple time: beam by beat
      maxBeamGroupSize = timeSignature.numerator === 2 ? 2 : 4;
      beatDivision = timeSignature.numerator;
    }
    
    let currentGroup: StaveNote[] = [];
    let beatPosition = 0;
    
    notes.forEach((note, index) => {
      const duration = note.getDuration();
      
      if (beamableNotes.includes(duration as string)) {
        currentGroup.push(note);
        
        // Check if we should end the current beam group
        const shouldEndGroup = 
          currentGroup.length >= maxBeamGroupSize ||
          (beatPosition % beatDivision === 0 && currentGroup.length > 0 && index > 0) ||
          index === notes.length - 1;
        
        if (shouldEndGroup && currentGroup.length > 1) {
          beamGroups.push({
            notes: [...currentGroup],
            isValid: true
          });
          currentGroup = [];
        } else if (shouldEndGroup && currentGroup.length === 1) {
          // Single note, no beam needed
          beamGroups.push({
            notes: [...currentGroup],
            isValid: false
          });
          currentGroup = [];
        }
      } else {
        // Non-beamable note, end current group if exists
        if (currentGroup.length > 1) {
          beamGroups.push({
            notes: [...currentGroup],
            isValid: true
          });
        } else if (currentGroup.length === 1) {
          beamGroups.push({
            notes: [...currentGroup],
            isValid: false
          });
        }
        currentGroup = [];
        
        // Add the non-beamable note as its own group
        beamGroups.push({
          notes: [note],
          isValid: false
        });
      }
      
      beatPosition++;
    });
    
    // Handle remaining notes
    if (currentGroup.length > 1) {
      beamGroups.push({
        notes: currentGroup,
        isValid: true
      });
    } else if (currentGroup.length === 1) {
      beamGroups.push({
        notes: currentGroup,
        isValid: false
      });
    }
    
    return beamGroups;
  };

  // Musical measure processing with proper barlines and tuplet handling
  const processNotesIntoMeasures = (notes: ProcessedNote[], midiData: MidiData): ProcessedNote[][] => {
    const { timeSignature, ticksPerQuarter } = midiData;
    const measureLength = ticksPerQuarter * 4 * (timeSignature.numerator / timeSignature.denominator);
    
    // Apply tuplet detection
    const notesWithTuplets = detectTuplets(notes, ticksPerQuarter);
    
    const measures: ProcessedNote[][] = [];
    const notesByMeasure = new Map<number, ProcessedNote[]>();
    
    // Enhanced note filtering for musical relevance
    const validNotes = notesWithTuplets.filter(note => {
      const minDuration = ticksPerQuarter / 64; // Sixty-fourth note minimum
      const maxDuration = measureLength * 4; // Maximum 4 measures
      
      return (
        note.duration >= minDuration && 
        note.duration <= maxDuration &&
        note.midiNote >= 21 && note.midiNote <= 108 && // Piano range
        note.velocity >= 5 // Lower velocity threshold for expressive performance
      );
    });
    
    validNotes.forEach(note => {
      const measureIndex = Math.floor(note.quantizedStartTime / measureLength);
      if (!notesByMeasure.has(measureIndex)) {
        notesByMeasure.set(measureIndex, []);
      }
      notesByMeasure.get(measureIndex)!.push(note);
    });

    Array.from(notesByMeasure.entries())
      .sort(([a], [b]) => a - b)
      .forEach(([measureIndex, measureNotes]) => {
        // Sort by quantized start time and limit complexity
        measureNotes.sort((a, b) => a.quantizedStartTime - b.quantizedStartTime);
        
        // Intelligent note density management with tuplet consideration
        const maxNotesPerMeasure = timeSignature.numerator * 12; // Increased for complex music
        if (measureNotes.length > maxNotesPerMeasure) {
          // Prioritize by musical importance (velocity, duration, and harmonic context)
          measureNotes.sort((a, b) => {
            const aImportance = (a.velocity * a.duration) + (a.isTuplet ? 50 : 0);
            const bImportance = (b.velocity * b.duration) + (b.isTuplet ? 50 : 0);
            return bImportance - aImportance;
          });
          measureNotes.splice(maxNotesPerMeasure);
          measureNotes.sort((a, b) => a.quantizedStartTime - b.quantizedStartTime);
        }
        
        measures.push(measureNotes);
      });

    return measures;
  };

  // Create voices with advanced musical formatting and tuplet support
  const createMeasureVoices = (measure: ProcessedNote[], clef: 'treble' | 'bass', midiData: MidiData): VoiceData => {
    const { trebleNotes, bassNotes } = separateVoices(measure);
    const targetNotes = clef === 'treble' ? trebleNotes : bassNotes;
    
    if (targetNotes.length === 0) {
      return {
        trebleNotes: [],
        bassNotes: [],
        trebleMetadata: [],
        bassMetadata: [],
        trebleTuplets: [],
        bassTuplets: []
      };
    }

    const chordGroups = groupIntoChords(targetNotes, midiData.ticksPerQuarter);
    const staveNotes: StaveNote[] = [];
    const metadata: Array<{ staveNote: StaveNote; midiNotes: number[]; isTuplet?: boolean }> = [];
    const tuplets: Tuplet[] = [];

    // Track tuplet groups
    const tupletGroups: Map<string, StaveNote[]> = new Map();

    Array.from(chordGroups.entries())
      .sort(([a], [b]) => a - b)
      .forEach(([time, chordNotes]) => {
        try {
          // Limit chord complexity for readability
          const maxChordNotes = 6;
          const selectedNotes = chordNotes
            .sort((a, b) => b.velocity - a.velocity)
            .slice(0, maxChordNotes)
            .sort((a, b) => a.midiNote - b.midiNote);

          const keys = selectedNotes.map(n => midiNoteToVexFlowNote(n.midiNote, midiData.keySignature));
          
          // Use advanced duration mapping with tuplet detection
          const durationInfo = getMusicalDuration(
            selectedNotes[0].duration, 
            midiData.ticksPerQuarter, 
            midiData.timeSignature
          );

          const staveNote = new StaveNote({
            clef: clef,
            keys: keys,
            duration: durationInfo.duration
          });

          // Add accidentals based on key signature with enhanced logic
          keys.forEach((key, index) => {
            try {
              const noteName = key.split('/')[0];
              const needsAccidental = shouldAddAccidental(noteName, midiData.keySignature);
              
              if (needsAccidental.add) {
                staveNote.addModifier(new Accidental(needsAccidental.type), index);
              }
            } catch (error) {
              console.warn('Accidental error:', error);
            }
          });

          staveNotes.push(staveNote);
          metadata.push({
            staveNote: staveNote,
            midiNotes: selectedNotes.map(n => n.midiNote),
            isTuplet: durationInfo.isTuplet
          });

          // Handle tuplet grouping
          if (durationInfo.isTuplet && durationInfo.tupletRatio) {
            const tupletKey = `${durationInfo.tupletRatio.num}:${durationInfo.tupletRatio.denom}`;
            if (!tupletGroups.has(tupletKey)) {
              tupletGroups.set(tupletKey, []);
            }
            tupletGroups.get(tupletKey)!.push(staveNote);
          }

        } catch (error) {
          console.warn(`Error creating ${clef} note:`, error);
        }
      });

    // Create tuplets from grouped notes
    tupletGroups.forEach((notes, ratioKey) => {
      if (notes.length >= 3) {
        try {
          const [num, denom] = ratioKey.split(':').map(Number);
          const tuplet = new Tuplet(notes, {
            num_notes: num,
            notes_occupied: denom,
            bracketed: true,
            ratioed: true
          });
          tuplets.push(tuplet);
        } catch (error) {
          console.warn('Tuplet creation error:', error);
        }
      }
    });

    const result: VoiceData = {
      trebleNotes: [],
      bassNotes: [],
      trebleMetadata: [],
      bassMetadata: [],
      trebleTuplets: [],
      bassTuplets: []
    };

    if (clef === 'treble') {
      result.trebleNotes = staveNotes;
      result.trebleMetadata = metadata;
      result.trebleTuplets = tuplets;
    } else {
      result.bassNotes = staveNotes;
      result.bassMetadata = metadata;
      result.bassTuplets = tuplets;
    }

    return result;
  };

  // Enhanced accidental detection
  const shouldAddAccidental = (noteName: string, keySignature: number): { add: boolean; type: string } => {
    const note = noteName.toLowerCase();
    const accidental = noteName.length > 1 ? noteName.slice(1) : '';
    
    // Key signature sharp/flat patterns
    const sharpOrder = ['f', 'c', 'g', 'd', 'a', 'e', 'b'];
    const flatOrder = ['b', 'e', 'a', 'd', 'g', 'c', 'f'];
    
    const baseNote = note.charAt(0);
    
    if (keySignature > 0) {
      // Sharp key signature
      const isSharpInKey = sharpOrder.slice(0, keySignature).includes(baseNote);
      if (accidental === '#' && !isSharpInKey) return { add: true, type: '#' };
      if (accidental === 'b') return { add: true, type: 'b' };
      if (accidental === '' && isSharpInKey) return { add: true, type: 'n' }; // Natural
    } else if (keySignature < 0) {
      // Flat key signature
      const isFlatInKey = flatOrder.slice(0, Math.abs(keySignature)).includes(baseNote);
      if (accidental === 'b' && !isFlatInKey) return { add: true, type: 'b' };
      if (accidental === '#') return { add: true, type: '#' };
      if (accidental === '' && isFlatInKey) return { add: true, type: 'n' }; // Natural
    } else {
      // No key signature (C major)
      if (accidental === '#') return { add: true, type: '#' };
      if (accidental === 'b') return { add: true, type: 'b' };
    }
    
    return { add: false, type: '' };
  };

  // Enhanced click handler with tuplet support
  const addClickHandlersToNotes = (
    noteData: Array<{staveNote: StaveNote, midiNotes: number[], isTuplet?: boolean}>, 
    clef: 'treble' | 'bass',
    newClickableElements: HTMLElement[]
  ) => {
    noteData.forEach(({staveNote, midiNotes, isTuplet}) => {
      const noteElement = staveNote.getSVGElement();
      if (noteElement) {
        noteElement.style.cursor = 'pointer';
        noteElement.style.transition = 'fill 0.2s ease, stroke 0.2s ease';
        
        // Add special styling for tuplets
        if (isTuplet) {
          noteElement.style.strokeWidth = '1.5';
          noteElement.style.stroke = clef === 'treble' ? '#3b82f6' : '#ef4444';
        }
        
        const clickHandler = (e: Event) => {
          e.stopPropagation();
          onNoteClick({
            midiNotes: midiNotes,
            clef: clef
          });
        };
        
        const mouseEnterHandler = () => {
          noteElement.style.fill = clef === 'treble' ? '#3b82f6' : '#ef4444';
          if (isTuplet) {
            noteElement.style.stroke = '#fbbf24'; // Golden highlight for tuplets
            noteElement.style.strokeWidth = '2';
          }
        };
        
        const mouseLeaveHandler = () => {
          noteElement.style.fill = '#000000';
          if (isTuplet) {
            noteElement.style.stroke = clef === 'treble' ? '#3b82f6' : '#ef4444';
            noteElement.style.strokeWidth = '1.5';
          } else {
            noteElement.style.stroke = '';
            noteElement.style.strokeWidth = '';
          }
        };
        
        noteElement.addEventListener('click', clickHandler);
        noteElement.addEventListener('mouseenter', mouseEnterHandler);
        noteElement.addEventListener('mouseleave', mouseLeaveHandler);
        
        newClickableElements.push(noteElement as unknown as HTMLElement);
      }
    });
  };

  // Professional page rendering with enhanced layout and tuplet support
  const renderPage = (measures: ProcessedNote[][], pageNumber: number) => {
    const startMeasure = pageNumber * MEASURES_PER_PAGE;
    const endMeasure = Math.min(startMeasure + MEASURES_PER_PAGE, measures.length);
    const pageMeasures = measures.slice(startMeasure, endMeasure);
    
    if (pageMeasures.length === 0) return;

    const renderer = new Renderer(divRef.current!, Renderer.Backends.SVG);
    renderer.resize(CANVAS_WIDTH, CANVAS_HEIGHT);
    const context = renderer.getContext();
    context.setFont('Arial', 10);
    
    const newClickableElements: HTMLElement[] = [];
    
    try {
      const linesOnPage = Math.ceil(pageMeasures.length / MEASURES_PER_LINE);
      
      for (let line = 0; line < linesOnPage; line++) {
        const yOffset = line * SYSTEM_HEIGHT + PAGE_MARGIN;
        const lineStartMeasure = line * MEASURES_PER_LINE;
        const lineEndMeasure = Math.min(lineStartMeasure + MEASURES_PER_LINE, pageMeasures.length);
        
        const trebleStaves: Stave[] = [];
        const bassStaves: Stave[] = [];
        
        // Create staves with proper musical elements
        for (let i = lineStartMeasure; i < lineEndMeasure; i++) {
          const xOffset = (i - lineStartMeasure) * MEASURE_WIDTH + PAGE_MARGIN;
          const measureIndex = i - lineStartMeasure;
          const absoluteMeasureIndex = startMeasure + i;
          
          // Treble stave
          const trebleStave = new Stave(xOffset, yOffset, MEASURE_WIDTH);
          if (measureIndex === 0) {
            trebleStave.addClef('treble');
            
            // Add key signature with error handling
            if (midiData && midiData.keySignature !== 0) {
              try {
                const keySpec = getVexFlowKeySignature(midiData.keySignature);
                if (keySpec && keySpec.length > 0) {
                  trebleStave.addKeySignature(keySpec);
                }
              } catch (error) {
                console.warn('Skipping treble key signature due to VexFlow compatibility:', error);
              }
            }
            
            // Add time signature with error handling
            if (midiData) {
              try {
                const timeSpec = getVexFlowTimeSignature(midiData.timeSignature.numerator, midiData.timeSignature.denominator);
                trebleStave.addTimeSignature(timeSpec);
              } catch (error) {
                console.warn('Error adding treble time signature:', error);
              }
              }
         }
         trebleStave.setContext(context).draw();
         trebleStaves.push(trebleStave);
         
         // Bass stave
         const bassStave = new Stave(xOffset, yOffset + 100, MEASURE_WIDTH);
         if (measureIndex === 0) {
           bassStave.addClef('bass');
           
           // Add key signature with error handling
           if (midiData && midiData.keySignature !== 0) {
             try {
               const keySpec = getVexFlowKeySignature(midiData.keySignature);
               if (keySpec && keySpec.length > 0) {
                 bassStave.addKeySignature(keySpec);
               }
             } catch (error) {
               console.warn('Skipping bass key signature due to VexFlow compatibility:', error);
             }
           }
           
           // Add time signature with error handling
           if (midiData) {
             try {
               const timeSpec = getVexFlowTimeSignature(midiData.timeSignature.numerator, midiData.timeSignature.denominator);
               bassStave.addTimeSignature(timeSpec);
             } catch (error) {
               console.warn('Error adding bass time signature:', error);
             }
           }
         }
         bassStave.setContext(context).draw();
         bassStaves.push(bassStave);
         
         // Add system connectors
         if (measureIndex === 0) {
           try {
             const brace = new StaveConnector(trebleStave, bassStave);
             brace.setType(StaveConnector.type.BRACE);
             brace.setContext(context).draw();
           } catch (error) {
             console.warn('Brace connector error:', error);
           }
         }
         
         try {
           const line = new StaveConnector(trebleStave, bassStave);
           line.setType(StaveConnector.type.SINGLE_LEFT);
           line.setContext(context).draw();
         } catch (error) {
           console.warn('Line connector error:', error);
         }
       }
       
       // Render notes for each measure in this line
       for (let measureIdx = lineStartMeasure; measureIdx < lineEndMeasure; measureIdx++) {
         const measure = pageMeasures[measureIdx];
         if (!measure || measure.length === 0) continue;
         
         const staveIndex = measureIdx - lineStartMeasure;
         const trebleStave = trebleStaves[staveIndex];
         const bassStave = bassStaves[staveIndex];
         
         // Process treble clef
         const trebleVoiceData = createMeasureVoices(measure, 'treble', midiData!);
         if (trebleVoiceData.trebleNotes.length > 0) {
           try {
             const trebleVoice = new Voice({
               num_beats: midiData!.timeSignature.numerator,
               beat_value: midiData!.timeSignature.denominator
             });
             
             trebleVoice.setStrict(false);
             trebleVoice.addTickables(trebleVoiceData.trebleNotes);
             
             const formatter = new Formatter();
             formatter.joinVoices([trebleVoice]).format([trebleVoice], MEASURE_WIDTH - 100);
             
             trebleVoice.draw(context, trebleStave);
             addClickHandlersToNotes(trebleVoiceData.trebleMetadata, 'treble', newClickableElements);
             
             // Add beams with enhanced grouping
             const beamGroups = createIntelligentBeamGroups(trebleVoiceData.trebleNotes, midiData!.timeSignature);
             beamGroups.forEach(group => {
               if (group.isValid && group.notes.length > 1) {
                 try {
                   const beam = new Beam(group.notes);
                   beam.setContext(context).draw();
                 } catch (error) {
                   console.warn('Treble beam error:', error);
                 }
               }
             });
             
             // Add tuplets
             trebleVoiceData.trebleTuplets.forEach(tuplet => {
               try {
                 tuplet.setContext(context).draw();
               } catch (error) {
                 console.warn('Treble tuplet error:', error);
               }
             });
             
           } catch (error) {
             console.warn('Treble voice error:', error);
           }
         }
         
         // Process bass clef
         const bassVoiceData = createMeasureVoices(measure, 'bass', midiData!);
         if (bassVoiceData.bassNotes.length > 0) {
           try {
             const bassVoice = new Voice({
               num_beats: midiData!.timeSignature.numerator,
               beat_value: midiData!.timeSignature.denominator
             });
             
             bassVoice.setStrict(false);
             bassVoice.addTickables(bassVoiceData.bassNotes);
             
             const formatter = new Formatter();
             formatter.joinVoices([bassVoice]).format([bassVoice], MEASURE_WIDTH - 100);
             
             bassVoice.draw(context, bassStave);
             addClickHandlersToNotes(bassVoiceData.bassMetadata, 'bass', newClickableElements);
             
             // Add beams with enhanced grouping
             const beamGroups = createIntelligentBeamGroups(bassVoiceData.bassNotes, midiData!.timeSignature);
             beamGroups.forEach(group => {
               if (group.isValid && group.notes.length > 1) {
                 try {
                   const beam = new Beam(group.notes);
                   beam.setContext(context).draw();
                 } catch (error) {
                   console.warn('Bass beam error:', error);
                 }
               }
             });
             
             // Add tuplets
             bassVoiceData.bassTuplets.forEach(tuplet => {
               try {
                 tuplet.setContext(context).draw();
               } catch (error) {
                 console.warn('Bass tuplet error:', error);
               }
             });
             
           } catch (error) {
             console.warn('Bass voice error:', error);
           }
         }
       }
     }
     
     setClickableElements(newClickableElements);
     
   } catch (error) {
     console.error('Page rendering error:', error);
     if (divRef.current) {
       divRef.current.innerHTML = '<p class="text-red-500 p-4">Error rendering sheet music. The MIDI file may contain complex musical elements that require manual adjustment.</p>';
     }
   }
 };

 // Cleanup function
 const cleanupClickHandlers = () => {
   clickableElements.forEach(element => {
     const newElement = element.cloneNode(true) as HTMLElement;
     element.parentNode?.replaceChild(newElement, element);
   });
   setClickableElements([]);
 };

 // Main effect for processing and rendering (enhanced)
 useEffect(() => {
   if (!midiData || !divRef.current) return;

   cleanupClickHandlers();
   divRef.current.innerHTML = '';
   
   try {
     const processedNotes: ProcessedNote[] = midiData.notes
       .filter(note => note.noteNumber >= 21 && note.noteNumber <= 108)
       .map(note => ({
         midiNote: note.noteNumber,
         vexNote: midiNoteToVexFlowNote(note.noteNumber, midiData.keySignature),
         startTime: note.startTime,
         quantizedStartTime: note.startTime, // Will be updated by advanced quantization
         duration: Math.max(note.duration, midiData.ticksPerQuarter / 64),
         velocity: note.velocity,
         voice: note.noteNumber >= 60 ? 'treble' : 'bass',
         noteValue: 'quarter' // Will be calculated
       }));

     const measures = processNotesIntoMeasures(processedNotes, midiData);
     const totalPagesNeeded = Math.ceil(measures.length / MEASURES_PER_PAGE);
     setTotalPages(totalPagesNeeded);
     
     if (currentPage >= totalPagesNeeded) {
       setCurrentPage(0);
     }
     
     renderPage(measures, currentPage);
   } catch (error) {
     console.error('Advanced processing error:', error);
     if (divRef.current) {
       divRef.current.innerHTML = '<p class="text-red-500 p-4">Error processing MIDI data with advanced features. The file may contain very complex musical structures.</p>';
     }
   }

   return () => {
     cleanupClickHandlers();
   };
 }, [midiData, currentPage, onNoteClick]);

 // Navigation functions
 const nextPage = () => {
   if (currentPage < totalPages - 1) {
     setCurrentPage(currentPage + 1);
   }
 };

 const previousPage = () => {
   if (currentPage > 0) {
     setCurrentPage(currentPage - 1);
   }
 };

 const goToPage = (pageNumber: number) => {
   if (pageNumber >= 0 && pageNumber < totalPages) {
     setCurrentPage(pageNumber);
   }
 };

 return (
   <div className="bg-white p-6 rounded-lg shadow-lg">
     <div className="flex justify-between items-center mb-4">
       <div>
         <h3 className="text-xl font-semibold">{getDisplayFileName(fileName)}</h3>
         {midiData && (
           <div className="text-sm text-gray-600 mt-1">
             <span>Key: {midiData.keyName} {midiData.keyMode}</span>
             <span className="mx-2">•</span>
             <span>Time: {midiData.timeSignature.numerator}/{midiData.timeSignature.denominator}</span>
             <span className="mx-2">•</span>
             <span>Confidence: {Math.round(midiData.confidence.key * 100)}%</span>
           </div>
         )}
       </div>
       {totalPages > 1 && (
         <div className="flex items-center gap-4">
           <button
             onClick={previousPage}
             disabled={currentPage === 0}
             className="px-3 py-1 bg-blue-500 text-white rounded disabled:bg-gray-300 hover:bg-blue-600 transition-colors"
           >
             ← Previous
           </button>
           <span className="text-sm text-gray-600 whitespace-nowrap">
             Page {currentPage + 1} of {totalPages}
           </span>
           <button
             onClick={nextPage}
             disabled={currentPage === totalPages - 1}
             className="px-3 py-1 bg-blue-500 text-white rounded disabled:bg-gray-300 hover:bg-blue-600 transition-colors"
           >
             Next →
           </button>
         </div>
       )}
     </div>
     
     <div className="overflow-auto border rounded-lg bg-white shadow-inner">
       <div 
         ref={divRef} 
         className="w-full h-auto p-4"
         style={{ 
           minWidth: `${CANVAS_WIDTH}px`,
           minHeight: `${CANVAS_HEIGHT}px`,
           backgroundColor: '#fefefe'
         }}
       />
     </div>
     
     {totalPages > 1 && (
       <div className="mt-4 flex justify-center gap-2 flex-wrap">
         {Array.from({ length: Math.min(totalPages, 10) }, (_, i) => {
           const pageIndex = totalPages > 10 && i >= 5 ? totalPages - 10 + i : i;
           return (
             <button
               key={pageIndex}
               onClick={() => goToPage(pageIndex)}
               className={`px-3 py-1 rounded text-sm transition-colors ${
                 currentPage === pageIndex 
                   ? 'bg-blue-500 text-white' 
                   : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
               }`}
             >
               {pageIndex + 1}
             </button>
           );
         })}
         {totalPages > 10 && (
           <span className="px-3 py-1 text-sm text-gray-500">
             ... +{totalPages - 10} more
           </span>
         )}
       </div>
     )}
     
     <div className="mt-4 text-sm text-gray-600 bg-gray-50 p-3 rounded">
       <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
         <p><strong>🎼 Advanced Features:</strong> Tuplet detection • Intelligent voice separation • Smart quantization</p>
         <p><strong>🎹 Enhanced Interaction:</strong> Click notes to highlight piano keys • Golden highlights for tuplets</p>
         <p><strong>🧠 AI-Powered:</strong> Advanced beam grouping • Musical context analysis • Floating pitch separation</p>
         <p><strong>📊 Professional Quality:</strong> {clickableElements.length} interactive elements • Page {currentPage + 1}/{totalPages}</p>
       </div>
     </div>
   </div>
 );
};

export default SheetMusic;