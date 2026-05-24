import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { PlayerShotRecord, TimerType, TournamentInfo } from '../types';

export function exportToPDF(records: PlayerShotRecord[], tournament?: TournamentInfo) {
  const doc = new jsPDF();
  
  doc.setFontSize(20);
  doc.text(tournament?.name || 'Golf Officiating Session Report', 14, 20);
  
  doc.setFontSize(11);
  if (tournament?.round) {
    doc.text(`Round: ${tournament.round}`, 14, 28);
  }
  doc.text(`Date: ${new Date().toLocaleString()}`, 14, 34);

  const tableData = records.map(r => {
    const isSearch = r.type === TimerType.LOST_BALL;
    const isFlag = r.type === TimerType.FLAG_IN;
    
    let typeLabel = 'SHOT';
    if (isSearch) typeLabel = 'SEARCH';
    if (isFlag) typeLabel = 'PACE';

    let timeFormatted = `${r.timeTaken.toFixed(1)}s`;
    if (isSearch) timeFormatted = `${Math.floor(r.timeTaken / 60)}:${(r.timeTaken % 60).toString().padStart(2, '0')}`;
    if (isFlag) timeFormatted = `${r.timeTaken > 0 ? '+' : ''}${r.timeTaken}m`;
    
    let limitLabel = `${r.limit}s`;
    if (isSearch) limitLabel = '3:00';
    if (isFlag) limitLabel = `T:${r.targetTime} A:${r.actualTime}`;

    return [
      new Date(r.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      typeLabel,
      r.hole,
      r.group,
      r.playerName,
      timeFormatted,
      limitLabel,
      isSearch || isFlag ? (r.isSlow ? 'BEHIND' : 'AHEAD/OK') : (r.isSlow ? 'SLOW' : 'OK'),
      r.latitude && r.longitude ? `${r.latitude.toFixed(4)}, ${r.longitude.toFixed(4)}` : '-'
    ];
  });

  autoTable(doc, {
    startY: 40,
    head: [['Time', 'Type', 'Hole', 'Grp', 'Player', 'Taken', 'Limit', 'Status', 'Location']],
    body: tableData,
    headStyles: { fillColor: [30, 30, 30] },
    alternateRowStyles: { fillColor: [245, 245, 245] },
    styles: { fontSize: 8 },
    columnStyles: {
      8: { fontSize: 7 }
    },
    willDrawCell: (data) => {
      if (data.section === 'body' && data.column.index === 7) {
        const record = records[data.row.index];
        if (record.isSlow) {
          data.cell.styles.textColor = [255, 0, 0];
        }
      }
    },
    didDrawCell: (data) => {
      if (data.section === 'body' && data.column.index === 8) {
        const record = records[data.row.index];
        if (record.latitude && record.longitude) {
          const url = `https://www.google.com/maps?q=${record.latitude},${record.longitude}`;
          doc.link(data.cell.x, data.cell.y, data.cell.width, data.cell.height, { url });
        }
      }
    }
  });

  const fileName = tournament ? `${tournament.name}-Rd${tournament.round}-${Date.now()}.pdf` : `golf-session-${Date.now()}.pdf`;
  doc.save(fileName);
}
