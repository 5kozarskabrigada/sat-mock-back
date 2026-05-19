import { Injectable } from '@nestjs/common';
import * as PDFDocument from 'pdfkit';
import { Readable } from 'stream';

interface StudentInfo {
  firstName: string;
  lastName: string;
  username: string;
  email?: string;
}

interface ExamInfo {
  title: string;
  completedAt: string;
}

interface ModuleSummary {
  label: string;
  correct: number;
  total: number;
}

interface DomainScore {
  domain: string;
  correct: number;
  total: number;
  percentage: number;
}

interface QuestionDetail {
  number: number;
  domain: string;
  correctAnswer: string;
  studentAnswer: string;
  result: 'Correct' | 'Incorrect' | 'Skipped';
}

interface SectionBreakdown {
  label: string;
  correct: number;
  total: number;
  questions: QuestionDetail[];
}

interface ReportData {
  student: StudentInfo;
  exam: ExamInfo;
  totalScore: number;
  rwScore: number;
  mathScore: number;
  moduleSummaries: ModuleSummary[];
  domainScores: DomainScore[];
  sectionBreakdowns: SectionBreakdown[];
  lockdownViolations?: number;
}

@Injectable()
export class PdfService {
  async generateExamReportPDF(reportData: ReportData): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Brand colors
      const primaryColor = '#123b71';
      const accentBlue = '#3b82f6';
      const accentGreen = '#10b981';
      const accentRed = '#ef4444';
      const lightGray = '#f3f4f6';
      const darkGray = '#374151';

      // Header with branding
      doc
        .fillColor(primaryColor)
        .fontSize(28)
        .font('Helvetica-Bold')
        .text('ExamRoom', { align: 'center' })
        .moveDown(0.3);

      doc
        .fillColor(darkGray)
        .fontSize(20)
        .font('Helvetica-Bold')
        .text('SAT Exam Score Report', { align: 'center' })
        .moveDown(1.5);

      // Student Information Box
      const studentBoxY = doc.y;
      doc
        .fillColor(lightGray)
        .rect(50, studentBoxY, 495, 80)
        .fill();

      doc
        .fillColor(primaryColor)
        .fontSize(12)
        .font('Helvetica-Bold')
        .text('Student Information', 65, studentBoxY + 15);

      doc
        .fillColor(darkGray)
        .fontSize(10)
        .font('Helvetica')
        .text(`Name: ${reportData.student.firstName} ${reportData.student.lastName}`, 65, studentBoxY + 35)
        .text(`Username: ${reportData.student.username}`, 65, studentBoxY + 50);

      if (reportData.student.email) {
        doc.text(`Email: ${reportData.student.email}`, 65, studentBoxY + 65);
      }

      // Exam Information
      doc
        .fillColor(primaryColor)
        .fontSize(10)
        .font('Helvetica-Bold')
        .text('Exam:', 320, studentBoxY + 35)
        .fillColor(darkGray)
        .font('Helvetica')
        .text(reportData.exam.title, 360, studentBoxY + 35, { width: 170 });

      doc
        .fillColor(primaryColor)
        .font('Helvetica-Bold')
        .text('Completed:', 320, studentBoxY + 50)
        .fillColor(darkGray)
        .font('Helvetica')
        .text(new Date(reportData.exam.completedAt).toLocaleDateString(), 380, studentBoxY + 50);

      doc.moveDown(5);

      // Total Score - Big Display
      const scoreBoxY = doc.y + 20;
      doc
        .fillColor(primaryColor)
        .rect(50, scoreBoxY, 495, 100)
        .fill();

      doc
        .fillColor('white')
        .fontSize(16)
        .font('Helvetica-Bold')
        .text('Total SAT Score', 0, scoreBoxY + 20, { align: 'center' });

      doc
        .fontSize(48)
        .font('Helvetica-Bold')
        .text(reportData.totalScore.toString(), 0, scoreBoxY + 45, { align: 'center' });

      doc
        .fontSize(12)
        .font('Helvetica')
        .text('out of 1600', 0, scoreBoxY + 95, { align: 'center' });

      doc.moveDown(8);

      // Section Scores
      const sectionScoreY = doc.y + 10;
      const boxWidth = 230;
      const boxHeight = 70;

      // Reading & Writing Score Box
      doc
        .fillColor(accentBlue)
        .rect(60, sectionScoreY, boxWidth, boxHeight)
        .fill();

      doc
        .fillColor('white')
        .fontSize(12)
        .font('Helvetica-Bold')
        .text('Reading & Writing', 60, sectionScoreY + 15, { width: boxWidth, align: 'center' });

      doc
        .fontSize(32)
        .text(reportData.rwScore.toString(), 60, sectionScoreY + 35, { width: boxWidth, align: 'center' });

      // Math Score Box
      doc
        .fillColor('#06b6d4')
        .rect(305, sectionScoreY, boxWidth, boxHeight)
        .fill();

      doc
        .fillColor('white')
        .fontSize(12)
        .font('Helvetica-Bold')
        .text('Math', 305, sectionScoreY + 15, { width: boxWidth, align: 'center' });

      doc
        .fontSize(32)
        .text(reportData.mathScore.toString(), 305, sectionScoreY + 35, { width: boxWidth, align: 'center' });

      doc.moveDown(6);

      // Module Performance Summary
      if (reportData.moduleSummaries && reportData.moduleSummaries.length > 0) {
        doc.y = sectionScoreY + boxHeight + 30;
        doc
          .fillColor(primaryColor)
          .fontSize(14)
          .font('Helvetica-Bold')
          .text('Module Performance', 50)
          .moveDown(0.5);

        const moduleY = doc.y;
        reportData.moduleSummaries.forEach((module, index) => {
          const percentage = Math.round((module.correct / module.total) * 100);
          const xPos = index % 2 === 0 ? 60 : 305;
          const yPos = moduleY + Math.floor(index / 2) * 50;

          doc
            .fillColor(darkGray)
            .fontSize(10)
            .font('Helvetica-Bold')
            .text(module.label, xPos, yPos);

          doc
            .fontSize(9)
            .font('Helvetica')
            .text(`${module.correct} / ${module.total} correct (${percentage}%)`, xPos, yPos + 15);

          // Progress bar
          const barWidth = 200;
          const barHeight = 8;
          const fillWidth = (module.correct / module.total) * barWidth;

          doc
            .fillColor('#e5e7eb')
            .rect(xPos, yPos + 30, barWidth, barHeight)
            .fill();

          doc
            .fillColor(percentage >= 70 ? accentGreen : percentage >= 50 ? '#f59e0b' : accentRed)
            .rect(xPos, yPos + 30, fillWidth, barHeight)
            .fill();
        });

        doc.moveDown(reportData.moduleSummaries.length > 2 ? 4 : 3);
      }

      // Domain Performance
      if (reportData.domainScores && reportData.domainScores.length > 0) {
        doc.addPage();
        doc
          .fillColor(primaryColor)
          .fontSize(14)
          .font('Helvetica-Bold')
          .text('Performance by Domain', 50, 50)
          .moveDown(0.8);

        const domainY = doc.y;
        reportData.domainScores.forEach((domain, index) => {
          const yPos = domainY + index * 40;

          doc
            .fillColor(darkGray)
            .fontSize(10)
            .font('Helvetica-Bold')
            .text(domain.domain, 60, yPos);

          doc
            .fontSize(9)
            .font('Helvetica')
            .text(`${domain.correct} / ${domain.total} (${Math.round(domain.percentage)}%)`, 60, yPos + 15);

          // Progress bar
          const barWidth = 400;
          const barHeight = 8;
          const fillWidth = (domain.percentage / 100) * barWidth;

          doc
            .fillColor('#e5e7eb')
            .rect(60, yPos + 28, barWidth, barHeight)
            .fill();

          doc
            .fillColor(domain.percentage >= 70 ? accentGreen : domain.percentage >= 50 ? '#f59e0b' : accentRed)
            .rect(60, yPos + 28, fillWidth, barHeight)
            .fill();
        });
      }

      // Question-by-Question Breakdown
      if (reportData.sectionBreakdowns && reportData.sectionBreakdowns.length > 0) {
        doc.addPage();
        doc
          .fillColor(primaryColor)
          .fontSize(14)
          .font('Helvetica-Bold')
          .text('Question-by-Question Breakdown', 50, 50)
          .moveDown(1);

        reportData.sectionBreakdowns.forEach((section) => {
          // Check if we need a new page
          if (doc.y > 700) {
            doc.addPage();
            doc.y = 50;
          }

          doc
            .fillColor(primaryColor)
            .fontSize(12)
            .font('Helvetica-Bold')
            .text(section.label, 50)
            .fontSize(9)
            .font('Helvetica')
            .fillColor(darkGray)
            .text(`${section.correct} / ${section.total} correct`, 50)
            .moveDown(0.5);

          section.questions.forEach((question) => {
            // Check if we need a new page
            if (doc.y > 720) {
              doc.addPage();
              doc.y = 50;
            }

            const resultColor =
              question.result === 'Correct' ? accentGreen : question.result === 'Incorrect' ? accentRed : '#6b7280';

            doc
              .fontSize(8)
              .fillColor(darkGray)
              .font('Helvetica')
              .text(`Q${question.number}: ${question.domain}`, 60, doc.y, { continued: true })
              .fillColor(resultColor)
              .font('Helvetica-Bold')
              .text(` • ${question.result}`, { continued: false });

            doc
              .fontSize(7)
              .fillColor('#6b7280')
              .font('Helvetica')
              .text(`Correct: ${question.correctAnswer} | Your answer: ${question.studentAnswer}`, 60)
              .moveDown(0.3);
          });

          doc.moveDown(0.8);
        });
      }

      // Security Information
      if (reportData.lockdownViolations !== undefined && reportData.lockdownViolations > 0) {
        doc.addPage();
        doc
          .fillColor(accentRed)
          .fontSize(14)
          .font('Helvetica-Bold')
          .text('Security Violations', 50, 50)
          .moveDown(0.5);

        doc
          .fillColor(darkGray)
          .fontSize(10)
          .font('Helvetica')
          .text(
            `This exam recorded ${reportData.lockdownViolations} lockdown violation(s). Violations occur when the student attempts to leave the exam window or access other applications during the test.`,
            50,
            { width: 495 },
          );
      }

      // Footer
      const pageCount = doc.bufferedPageRange().count;
      for (let i = 0; i < pageCount; i++) {
        doc.switchToPage(i);
        doc
          .fontSize(8)
          .fillColor('#9ca3af')
          .text(
            `Generated by ExamRoom • ${new Date().toLocaleDateString()} • Page ${i + 1} of ${pageCount}`,
            50,
            doc.page.height - 50,
            { align: 'center', width: 495 },
          );
      }

      doc.end();
    });
  }
}
