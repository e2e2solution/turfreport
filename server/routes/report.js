import { Router } from 'express';
import ExcelJS from 'exceljs';
import { buildTurfSheet, buildOnlineSheet, buildGymSheet, buildFootballCoachingSheet } from '../utils/excel.js';
import { queryReportData } from '../utils/reportQuery.js';
import { calcDailyCollection } from '../utils/dailyCollection.js';
import { countGymMembersJoined } from '../utils/gymCount.js';

const router = Router();

router.get('/daily-total', (req, res) => {
  const { date } = req.query;
  if (!date) return res.status(400).json({ error: 'date is required' });
  res.json(calcDailyCollection(date));
});

router.get('/preview', (req, res) => {
  const { from, to, match_date, filter_type, section, include_bulk_pending } = req.query;
  const data = queryReportData({
    from, to, match_date, filter_type, section: section || 'all', include_bulk_pending,
  });
  if (data.paymentFilter) {
    data.gym_members_joined = countGymMembersJoined(data.gym);
  }
  res.json(data);
});

router.get('/excel', async (req, res) => {
  const { from, to, match_date, filter_type, section, include_bulk_pending } = req.query;
  const { turf, online, gym, football_coaching, paymentFilter } = queryReportData({
    from, to, match_date, filter_type, section: section || 'turf_online', include_bulk_pending,
  });

  const workbook = new ExcelJS.Workbook();
  const sec = section || 'turf_online';

  if (sec !== 'gym' && (sec === 'turf' || sec === 'turf_online' || sec === 'all')) {
    buildTurfSheet(workbook.addWorksheet('Turf Match'), turf);
  }
  if (sec !== 'gym' && (sec === 'online' || sec === 'turf_online' || sec === 'all')) {
    buildOnlineSheet(workbook.addWorksheet('Online Booking'), online);
  }
  if (sec === 'gym' || sec === 'all') {
    buildGymSheet(workbook.addWorksheet('Gym'), gym);
  }
  if (sec === 'football_coaching' || sec === 'all') {
    buildFootballCoachingSheet(workbook.addWorksheet('Football Coaching'), football_coaching);
  }

  const buffer = await workbook.xlsx.writeBuffer();
  let filename = 'report.xlsx';
  if (sec === 'gym') {
    filename = paymentFilter
      ? `gym-payment-${match_date || `${from}-${to}`}.xlsx`
      : match_date ? `gym-report-${match_date}.xlsx` : `gym-report-${from}-${to}.xlsx`;
  } else if (paymentFilter) {
    filename = `payment-report-${match_date || `${from}-${to}`}.xlsx`;
  } else if (match_date) {
    filename = sec === 'gym' ? `gym-${match_date}.xlsx` : `report-${match_date}.xlsx`;
  } else if (from && to) {
    filename = `report-${from}-${to}.xlsx`;
  }

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(Buffer.from(buffer));
});

export default router;
