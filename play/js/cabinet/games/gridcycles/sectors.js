// THE NODE · GRID CYCLES · the six programs on the tournament bus.
export const SECTORS = Object.freeze([
    { name: 'OPEN CIRCUIT', rival: 'SCOUT', hint: 'LEAVE ROOM TO TURN', walls: [] },
    { name: 'PILLAR ARRAY', rival: 'MASON', hint: 'PILLARS SPLIT THE ROAD', walls: [[30,12,4,7],[40,30,4,7]] },
    { name: 'OVERCLOCK', rival: 'SURGE', hint: 'RIVAL BOOSTS AFTER THE PULSE', walls: [[32,20,10,3]], boost: true },
    { name: 'LOOP BUS', rival: 'LOOPER', hint: 'EDGES CONNECT - TRAILS DO NOT', walls: [[34,8,4,10],[34,31,4,10]], wrap: true },
    { name: 'LOCKDOWN', rival: 'WARDEN', hint: 'PINK LINES SEAL AFTER WARNING', walls: [[26,18,4,12],[44,18,4,12]], shrink: true },
    { name: 'MASTER PROGRAM', rival: 'MASTER', hint: 'PURGES ERASE TRAILS - KEEP MOVING', walls: [[32,14,10,3],[32,32,10,3]], boost: true, purge: true },
]);
