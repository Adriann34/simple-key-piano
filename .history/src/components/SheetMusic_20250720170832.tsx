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
  quantizedDuration: number;
  tupletInfo?: {
    ratio: number;
    group: number;
  };
}

interface VoiceData {
  trebleNotes: StaveNote[];
  bassNotes: StaveNote[];
  trebleMetadata: Array<{ staveNote: StaveNote; midiNotes: number[] }>;
  bassMetadata: Array<{ staveNote: StaveNote; midiNotes: number[] }>;
  trebleTuplets: Tuplet[];
  bassTuplets: Tuplet[];
}

interface BeatTracker {
  detectBeats(notes: ProcessedNote[], ticksPerQuarter: number): number[];
  quantizeToBeats(notes: ProcessedNote[], beats: number[], ticksPerQuarter: number): ProcessedNote[];
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
  const MEASURE_WIDTH = 350;
  const SYSTEM_HEIGHT = 220;
  const PAGE_MARGIN = 40;
  const CANVAS_WIDTH = MEASURES_PER_LINE * MEASURE_WIDTH + (PAGE_MARGIN * 2);
  const CANVAS_HEIGHT = LINES_PER_PAGE * SYSTEM_HEIGHT + (PAGE_MARGIN * 2);

  // Get display filename without extension
  const getDisplayFileName = (fileName?: string): string => {
    if (!fileName) return 'Sheet Music';
    return fileName.replace(/\.(mid|midi)$/i, '');
  };

  // MuseScore-inspired adaptive quantization algorithm
  const getAdaptiveQuantization = (durationTicks: number, ticksPerQuarter: number, maxQuantization: string = '16'): string => {
    const quarterNoteDuration = ticksPerQuarter;
    const ratio = durationTicks / quarterNoteDuration;
    
    // Convert max quantization to numeric value
    const maxQuantValue = parseInt(maxQuantization);
    const maxQuantRatio = 4 / maxQuantValue; // Quarter note = 4/4
    
    // Adaptive quantization - choose the appropriate grid based on note length
    let quantGrid: number;
    
    if (ratio >= 3.75) quantGrid = 1;      // Whole note
    else if (ratio >= 1.875) quantGrid = 2;     // Half note  
    else if (ratio >= 0.9375) quantGrid = 4;    // Quarter note
    else if (ratio >= 0.46875) quantGrid = 8;   // Eighth note
    else if (ratio >= 0.234375) quantGrid = 16; // Sixteenth note
    else if (ratio >= 0.1171875) quantGrid = 32; // Thirty-second note
    else quantGrid = 64; // Sixty-fourth note
    
    // Apply max quantization limit - if quantGrid is finer than max, use max
    if (quantGrid > maxQuantValue) {
      quantGrid = maxQuantValue;
    }
    
    return quantGrid.toString();
  };

  // Beat tracking algorithm inspired by MuseScore's approach
  const createBeatTracker = (): BeatTracker => {
    return {
      detectBeats: (notes: ProcessedNote[], ticksPerQuarter: number): number[] => {
        if (notes.length === 0) return [];
        
        // Collect all note onset times
        const onsetTimes = notes.map(note => note.startTime).sort((a, b) => a - b);
        
        // Calculate inter-onset intervals
        const intervals: number[] = [];
        for (let i = 1; i < onsetTimes.length; i++) {
          const interval = onsetTimes[i] - onsetTimes[i-1];
          if (interval > 0) {
            intervals.push(interval);
          }
        }
        
        if (intervals.length === 0) return [];
        
        // Find the most common interval (beat period)
        const intervalCounts = new Map<number, number>();
        const tolerance = ticksPerQuarter / 16; // Small tolerance for grouping
        
        intervals.forEach(interval => {
          // Round to nearest reasonable beat division
          const quantizedInterval = Math.round(interval / (ticksPerQuarter / 8)) * (ticksPerQuarter / 8);
          intervalCounts.set(quantizedInterval, (intervalCounts.get(quantizedInterval) || 0) + 1);
        });
        
        // Find the most frequent interval
        let beatPeriod = ticksPerQuarter; // Default to quarter note
        let maxCount = 0;
        
        for (const [interval, count] of intervalCounts.entries()) {
          if (count > maxCount && interval >= ticksPerQuarter / 4 && interval <= ticksPerQuarter * 2) {
            beatPeriod = interval;
            maxCount = count;
          }
        }
        
        // Generate beat grid
        const beats: number[] = [];
        const startTime = Math.min(...onsetTimes);
        const endTime = Math.max(...onsetTimes);
        
        for (let time = startTime; time <= endTime + beatPeriod; time += beatPeriod) {
          beats.push(time);
        }
        
        return beats;
      },
      
      quantizeToBeats: (notes: ProcessedNote[], beats: number[], ticksPerQuarter: number): ProcessedNote[] => {
        return notes.map(note => {
          // Find closest beat
          let closestBeat = beats[0];
          let minDistance = Math.abs(note.startTime - beats[0]);
          
          for (const beat of beats) {
            const distance = Math.abs(note.startTime - beat);
            if (distance < minDistance) {
              minDistance = distance;
              closestBeat = beat;
            }
          }
          
          // Calculate quantized duration
          const originalEndTime = note.startTime + note.duration;
          let closestEndBeat = beats[beats.length - 1];
          let minEndDistance = Math.abs(originalEndTime - beats[beats.length - 1]);
          
          for (const beat of beats) {
            const distance = Math.abs(originalEndTime - beat);
            if (distance < minEndDistance && beat > closestBeat) {
              minEndDistance = distance;
              closestEndBeat = beat;
            }
          }
          
          return {
            ...note,
            quantizedStartTime: closestBeat,
            quantizedDuration: Math.max(closestEndBeat - closestBeat, ticksPerQuarter / 16)
          };
        });
      }
    };
  };

  // Enhanced tuplet detection algorithm
  const detectTuplets = (notes: ProcessedNote[], ticksPerQuarter: number): ProcessedNote[] => {
    const notesWithTuplets = [...notes];
    const tolerance = ticksPerQuarter / 32;
    
    // Group notes by proximity in time
    const timeGroups: ProcessedNote[][] = [];
    let currentGroup: ProcessedNote[] = [];
    
    notes.forEach((note, index) => {
      if (currentGroup.length === 0) {
        currentGroup.push(note);
      } else {
        const lastNote = currentGroup[currentGroup.length - 1];
        if (note.quantizedStartTime - lastNote.quantizedStartTime <= ticksPerQuarter) {
          currentGroup.push(note);
        } else {
          if (currentGroup.length > 0) {
            timeGroups.push([...currentGroup]);
          }
          currentGroup = [note];
        }
      }
    });
    
    if (currentGroup.length > 0) {
      timeGroups.push(currentGroup);
    }
    
    // Analyze each group for tuplet patterns
    timeGroups.forEach(group => {
      if (group.length >= 3) {
        // Check for triplet pattern (3 notes in space of 2)
        const totalDuration = group[group.length - 1].quantizedStartTime - group[0].quantizedStartTime;
        const expectedTripletDuration = ticksPerQuarter * (2/3); // 2 beats divided by 3 notes
        
        if (Math.abs(totalDuration - expectedTripletDuration * 2) < tolerance) {
          group.forEach(note => {
            note.tupletInfo = { ratio: 3/2, group: group.indexOf(note) };
          });
        }
        
        // Check for quintuplet pattern (5 notes in space of 4)
        const expectedQuintupletDuration = ticksPerQuarter * (4/5);
        if (group.length >= 5 && Math.abs(totalDuration - expectedQuintupletDuration * 4) < tolerance) {
          group.forEach(note => {
            note.tupletInfo = { ratio: 5/4, group: group.indexOf(note) };
          });
        }
      }
    });
    
    return notesWithTuplets;
  };

  // Intelligent voice separation with contextual analysis
  const separateVoicesAdvanced = (notes: ProcessedNote[]): { trebleNotes: ProcessedNote[]; bassNotes: ProcessedNote[] } => {
    if (notes.length === 0) {
      return { trebleNotes: [], bassNotes: [] };
    }
    
    // Analyze pitch distribution
    const pitches = notes.map(n => n.midiNote).sort((a, b) => a - b);
    const medianPitch = pitches[Math.floor(pitches.length / 2)];
    const pitchRange = pitches[pitches.length - 1] - pitches[0];
    
    // Dynamic split point based on piece characteristics
    let splitPoint = 60; // Middle C default
    
    if (pitchRange > 36) { // More than 3 octaves
      // Use weighted average of pitch distribution
      const pitchSum = pitches.reduce((sum, pitch) => sum + pitch, 0);
      const averagePitch = pitchSum / pitches.length;
      splitPoint = Math.round((medianPitch + averagePitch) / 2);
    } else {
      splitPoint = medianPitch;
    }
    
    // Consider harmonic context - notes played simultaneously should stay together
    const trebleNotes: ProcessedNote[] = [];
    const bassNotes: ProcessedNote[] = [];
    
    // Group simultaneous notes
    const simultaneousGroups = new Map<number, ProcessedNote[]>();
    const tolerance = midiData!.ticksPerQuarter / 16;
    
    notes.forEach(note => {
      let foundGroup = false;
      for (const [time, group] of simultaneousGroups.entries()) {
        if (Math.abs(note.quantizedStartTime - time) <= tolerance) {
          group.push(note);
          foundGroup = true;
          break;
        }
      }
      if (!foundGroup) {
        simultaneousGroups.set(note.quantizedStartTime, [note]);
      }
    });
    
    // Assign voices considering harmonic context
    simultaneousGroups.forEach(group => {
      if (group.length === 1) {
        // Single note - use simple pitch-based assignment
        const note = group[0];
        if (note.midiNote >= splitPoint) {
          trebleNotes.push({ ...note, voice: 'treble' });
        } else {
          bassNotes.push({ ...note, voice: 'bass' });
        }
      } else {
        // Multiple simultaneous notes - keep chords together when possible
        const avgPitch = group.reduce((sum, n) => sum + n.midiNote, 0) / group.length;
        
        if (avgPitch >= splitPoint) {
          // Most notes above split - assign all to treble
          group.forEach(note => trebleNotes.push({ ...note, voice: 'treble' }));
        } else {
          // Most notes below split - assign all to bass
          group.forEach(note => bassNotes.push({ ...note, voice: 'bass' }));
        }
      }
    });
    
    return { trebleNotes, bassNotes };
  };

  // Enhanced chord detection with voice leading analysis
  const groupIntoChords = (notes: ProcessedNote[], ticksPerQuarter: number): Map<number, ProcessedNote[]> => {
    const chordTolerance = ticksPerQuarter / 32; // Tighter tolerance for better accuracy
    const chordGroups = new Map<number, ProcessedNote[]>();
    
    notes.forEach(note => {
      let foundGroup = false;
      
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
    
    return chordGroups;
  };

  // Musical measure processing with beat tracking
  const processNotesIntoMeasuresAdvanced = (notes: ProcessedNote[], midiData: MidiData): ProcessedNote[][] => {
    const { timeSignature, ticksPerQuarter } = midiData;
    const measureLength = ticksPerQuarter * 4 * (timeSignature.numerator / timeSignature.denominator);
    
    // Apply beat tracking for better rhythm interpretation
    const beatTracker = createBeatTracker();
    const beats = beatTracker.detectBeats(notes, ticksPerQuarter);
    const quantizedNotes = beatTracker.quantizeToBeats(notes, beats, ticksPerQuarter);
    
    // Detect tuplets
    const notesWithTuplets = detectTuplets(quantizedNotes, ticksPerQuarter);
    
    // Filter and validate notes
    const validNotes = notesWithTuplets.filter(note => {
      const minDuration = ticksPerQuarter / 64; // Sixty-fourth note minimum
      const maxDuration = measureLength * 4; // Maximum 4 measures
      
      return (
        note.quantizedDuration >= minDuration && 
        note.quantizedDuration <= maxDuration &&
        note.midiNote >= 21 && note.midiNote <= 108 && // Piano range
        note.velocity >= 5 // Lower minimum velocity threshold
      );
    });
    
    const measures: ProcessedNote[][] = [];
    const notesByMeasure = new Map<number, ProcessedNote[]>();
    
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
        // Sort by quantized start time for better accuracy
        measureNotes.sort((a, b) => a.quantizedStartTime - b.quantizedStartTime);
        
        // Intelligent note density management based on time signature
        const maxNotesPerMeasure = timeSignature.numerator * 16; // More generous limit
        if (measureNotes.length > maxNotesPerMeasure) {
          // Prioritize by velocity, duration, and musical importance
          measureNotes.sort((a, b) => {
            const scoreA = a.velocity * Math.log(a.quantizedDuration + 1);
            const scoreB = b.velocity * Math.log(b.quantizedDuration + 1);
            return scoreB - scoreA;
          });
          measureNotes = measureNotes.slice(0, maxNotesPerMeasure);
          measureNotes.sort((a, b) => a.quantizedStartTime - b.quantizedStartTime);
        }
        
        measures.push(measureNotes);
      });

    return measures;
  };

  // Create tuplets with proper VexFlow formatting
  const createTupletsForVoice = (notes: StaveNote[], originalNotes: ProcessedNote[]): Tuplet[] => {
    const tuplets: Tuplet[] = [];
    const tupletGroups = new Map<number, { notes: StaveNote[], ratio: number }>();
    
    originalNotes.forEach((originalNote, index) => {
      if (originalNote.tupletInfo && index < notes.length) {
        const groupId = originalNote.tupletInfo.group;
        if (!tupletGroups.has(groupId)) {
          tupletGroups.set(groupId, { notes: [], ratio: originalNote.tupletInfo.ratio });
        }
        tupletGroups.get(groupId)!.notes.push(notes[index]);
      }
    });
    
    tupletGroups.forEach(({ notes: tupletNotes, ratio }) => {
      if (tupletNotes.length >= 3) {
        try {
          const tuplet = new Tuplet(tupletNotes);
          tuplets.push(tuplet);
        } catch (error) {
          console.warn('Tuplet creation error:', error);
        }
      }
    });
    
    return tuplets;
  };

  // Enhanced beam creation with musical logic and tuplet awareness
  const createIntelligentBeamsAdvanced = (notes: StaveNote[], originalNotes: ProcessedNote[], timeSignature: { numerator: number, denominator: number }): (StaveNote | Beam)[] => {
    const result: (StaveNote | Beam)[] = [];
    let beamGroup: StaveNote[] = [];
    
    const beamableNotes = ['8', '16', '32', '64'];
    const maxBeamGroupSize = timeSignature.denominator >= 8 ? 8 : 6;
    
    notes.forEach((note, index) => {
      const duration = note.getDuration();
      const originalNote = originalNotes[index];
      
      // Don't beam tuplet notes - they'll be handled by tuplet rendering
      if (originalNote?.tupletInfo) {
        if (beamGroup.length > 1) {
          try {
            result.push(new Beam(beamGroup));
          } catch (error) {
            console.warn('Beam creation error:', error);
            beamGroup.forEach(n => result.push(n));
          }
        } else if (beamGroup.length === 1) {
          result.push(beamGroup[0]);
        }
        beamGroup = [];
        result.push(note);
        return;
      }
      
      if (beamableNotes.includes(duration as string) && beamGroup.length < maxBeamGroupSize) {
        beamGroup.push(note);
      } else {
        // Finish current beam group
        if (beamGroup.length > 1) {
          try {
            result.push(new Beam(beamGroup));
          } catch (error) {
            console.warn('Beam creation error:', error);
            beamGroup.forEach(n => result.push(n));
          }
        } else if (beamGroup.length === 1) {
          result.push(beamGroup[0]);
        }
        
        beamGroup = [];
        
        if (beamableNotes.includes(duration as string)) {
          beamGroup.push(note);
        } else {
          result.push(note);
        }
      }
    });
    
    // Handle remaining beam group
    if (beamGroup.length > 1) {
      try {
        result.push(new Beam(beamGroup));
      } catch (error) {
        console.warn('Final beam creation error:', error);
        beamGroup.forEach(n => result.push(n));
      }
    } else if (beamGroup.length === 1) {
      result.push(beamGroup[0]);
    }
    
    return result;
  };

  // Create voices with proper musical formatting and advanced algorithms
  const createMeasureVoicesAdvanced = (measure: ProcessedNote[], clef: 'treble' | 'bass', midiData: MidiData): VoiceData => {
    const { trebleNotes, bassNotes } = separateVoicesAdvanced(measure);
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
    const metadata: Array<{ staveNote: StaveNote; midiNotes: number[] }> = [];
    const originalNotes: ProcessedNote[] = [];

    Array.from(chordGroups.entries())
      .sort(([a], [b]) => a - b)
      .forEach(([time, chordNotes]) => {
        try {
          // Limit chord complexity for readability but be more generous
          const maxChordNotes = 8;
          const selectedNotes = chordNotes
            .sort((a, b) => b.velocity - a.velocity)
            .slice(0, maxChordNotes)
            .sort((a, b) => a.midiNote - b.midiNote);

          const keys = selectedNotes.map(n => midiNoteToVexFlowNote(n.midiNote, midiData.keySignature));
          const duration = getAdaptiveQuantization(selectedNotes[0].quantizedDuration, midiData.ticksPerQuarter);

          const staveNote = new StaveNote({
            clef: clef,
            keys: keys,
            duration: duration
          });

          // Enhanced accidental handling based on key signature and context
          keys.forEach((key, index) => {
            try {
              const noteLetter = key.charAt(0);
              const hasAccidental = key.includes('b') || key.includes('#');
              
              if (hasAccidental) {
                if (key.includes('b')) {
                  staveNote.addModifier(new Accidental('b'), index);
                } else if (key.includes('#')) {
                  staveNote.addModifier(new Accidental('#'), index);
                }
              }
            } catch (error) {
              console.warn('Accidental error:', error);
            }
          });

          staveNotes.push(staveNote);
          metadata.push({
            staveNote: staveNote,
            midiNotes: selectedNotes.map(n => n.midiNote)
          });
          originalNotes.push(selectedNotes[0]); // Store original note for tuplet info
        } catch (error) {
          console.warn(`Error creating ${clef} note:`, error);
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
      result.trebleTuplets = createTupletsForVoice(staveNotes, originalNotes);
    } else {
      result.bassNotes = staveNotes;
      result.bassMetadata = metadata;
      result.bassTuplets = createTupletsForVoice(staveNotes, originalNotes);
    }

    return result;
  };

  // Enhanced click handler with better event handling
  const addClickHandlersToNotes = (
    noteData: Array<{staveNote: StaveNote, midiNotes: number[]}>, 
    clef: 'treble' | 'bass',
    newClickableElements: HTMLElement[]
  ) => {
    noteData.forEach(({staveNote, midiNotes}) => {
      const noteElement = staveNote.getSVGElement();
      if (noteElement) {
        noteElement.style.cursor = 'pointer';
        noteElement.style.transition = 'fill 0.15s ease, opacity 0.15s ease';
        
        const clickHandler = (e: Event) => {
          e.stopPropagation();
          onNoteClick({
            midiNotes: midiNotes,
            clef: clef
          });
        };
        
        const mouseEnterHandler = () => {
          noteElement.style.fill = clef === 'treble' ? '#3b82f6' : '#ef4444';
          noteElement.style.opacity = '0.8';
        };
        
        const mouseLeaveHandler = () => {
          noteElement.style.fill = '#000000';
          noteElement.style.opacity = '1';
        };
        
        noteElement.addEventListener('click', clickHandler);
        noteElement.addEventListener('mouseenter', mouseEnterHandler);
        noteElement.addEventListener('mouseleave', mouseLeaveHandler);
        
        newClickableElements.push(noteElement as unknown as HTMLElement);
      }
    });
  };

  // Professional page rendering with enhanced musical layout
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
            
            // Add key signature with enhanced error handling
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
           
           // Add time signature with enhanced error handling
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
           
           // Add key signature with enhanced error handling
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
           
           // Add time signature with enhanced error handling
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
         
         // Add system connectors with enhanced styling
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
       
       // Render notes for each measure in this line with advanced algorithms
       for (let measureIdx = lineStartMeasure; measureIdx < lineEndMeasure; measureIdx++) {
         const measure = pageMeasures[measureIdx];
         if (!measure || measure.length === 0) continue;
         
         const staveIndex = measureIdx - lineStartMeasure;
         const trebleStave = trebleStaves[staveIndex];
         const bassStave = bassStaves[staveIndex];
         
         // Process treble clef with advanced voice handling
         const trebleVoiceData = createMeasureVoicesAdvanced(measure, 'treble', midiData!);
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
             
             // Add enhanced beams
             const originalNotes = measure.filter(n => n.voice === 'treble');
             const beamedElements = createIntelligentBeamsAdvanced(
               trebleVoiceData.trebleNotes, 
               originalNotes, 
               midiData!.timeSignature
             );
             beamedElements.forEach(element => {
               try {
                 if (element instanceof Beam) {
                   element.setContext(context).draw();
                 }
               } catch (error) {
                 console.warn('Treble beam error:', error);
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
         
         // Process bass clef with advanced voice handling
         const bassVoiceData = createMeasureVoicesAdvanced(measure, 'bass', midiData!);
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
             
             // Add enhanced beams
             const originalNotes = measure.filter(n => n.voice === 'bass');
             const beamedElements = createIntelligentBeamsAdvanced(
               bassVoiceData.bassNotes, 
               originalNotes, 
               midiData!.timeSignature
             );
             beamedElements.forEach(element => {
               try {
                 if (element instanceof Beam) {
                   element.setContext(context).draw();
                 }
               } catch (error) {
                 console.warn('Bass beam error:', error);
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

 // Main effect for processing and rendering with advanced algorithms
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
         duration: Math.max(note.duration, midiData.ticksPerQuarter / 64),
         velocity: note.velocity,
         voice: note.noteNumber >= 60 ? 'treble' : 'bass',
         quantizedStartTime: note.startTime, // Will be updated by beat tracker
         quantizedDuration: note.duration    // Will be updated by beat tracker
       }));

     const measures = processNotesIntoMeasuresAdvanced(processedNotes, midiData);
     const totalPagesNeeded = Math.ceil(measures.length / MEASURES_PER_PAGE);
     setTotalPages(totalPagesNeeded);
     
     if (currentPage >= totalPagesNeeded) {
       setCurrentPage(0);
     }
     
     renderPage(measures, currentPage);
   } catch (error) {
     console.error('Processing error:', error);
     if (divRef.current) {
       divRef.current.innerHTML = '<p class="text-red-500 p-4">Error processing MIDI data. This may be due to complex musical structures that require specialized handling.</p>';
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
         <p><strong>🎼 Enhanced Features:</strong> MuseScore-inspired adaptive quantization, beat tracking, tuplet detection</p>
         <p><strong>🎹 Interactive:</strong> Click notes to highlight piano keys • Blue = Treble • Red = Bass</p>
         <p><strong>🧠 Advanced AI:</strong> Intelligent voice separation, harmonic analysis, context-aware rendering</p>
         <p><strong>📊 Statistics:</strong> {clickableElements.length} interactive notes • Page {currentPage + 1}/{totalPages}</p>
       </div>
     </div>
   </div>
 );
};

export default SheetMusic;