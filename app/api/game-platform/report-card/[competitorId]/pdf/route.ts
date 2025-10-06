import { NextRequest, NextResponse } from 'next/server';
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join } from 'path';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ competitorId: string }> }
) {
  let browser;

  try {
    const { competitorId } = await context.params;

    // Get coach and school name from database using service role
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    const { data: competitorData } = await supabase
      .from('competitors')
      .select(`
        coach_id,
        team_members!inner(
          teams!inner(
            name
          )
        )
      `)
      .eq('id', competitorId)
      .single();

    const { data: coachProfile } = competitorData?.coach_id
      ? await supabase
          .from('profiles')
          .select('first_name, last_name, school_name')
          .eq('id', competitorData.coach_id)
          .single()
      : { data: null };

    const coachName = coachProfile
      ? `${coachProfile.first_name} ${coachProfile.last_name}`
      : 'Coach';
    const schoolName = coachProfile?.school_name || competitorData?.team_members?.[0]?.teams?.name || 'School';

    // Get optional section filters from query params
    const searchParams = request.nextUrl.searchParams;
    const sections = searchParams.get('sections')?.split(',') || [
      'header',
      'performance',
      'insights',
      'flash-ctf',
      'nist',
      'domains',
      'spider',
      'cumulative',
      'activity',
      // 'challenges' - excluded by default from PDF
    ];

    // Launch browser
    browser = await chromium.launch({
      headless: true,
    });

    const page = await browser.newPage();

    // Navigate to the report card page with section filters
    const reportUrl = new URL(`${request.nextUrl.origin}/dashboard/game-platform/report-card/${competitorId}`);
    reportUrl.searchParams.set('pdf', 'true');
    reportUrl.searchParams.set('sections', sections.join(','));

    // Copy cookies from the request to authenticate
    const cookies = request.headers.get('cookie');
    if (cookies) {
      const cookieArray = cookies.split(';').map(cookie => {
        const [name, value] = cookie.trim().split('=');
        return {
          name,
          value,
          domain: new URL(request.nextUrl.origin).hostname,
          path: '/',
        };
      });
      await page.context().addCookies(cookieArray);
    }

    await page.goto(reportUrl.toString(), { waitUntil: 'networkidle' });

    // Wait for content to load
    await page.waitForSelector('[data-competitor-name]', { timeout: 10000 }).catch(() => {
      // Fallback: just wait a bit if selector not found
      return page.waitForTimeout(2000);
    });

    // Emulate screen media to use screen CSS instead of print CSS
    await page.emulateMedia({ media: 'screen' });

    // Hide elements for PDF using JavaScript and set page break rules
    await page.evaluate(() => {
      // Add CSS to remove default Chromium print header/footer
      const style = document.createElement('style');
      style.textContent = '@page { margin: 0; }';
      document.head.appendChild(style);

      // Hide hamburger menu and other UI elements
      const selectorsToHide = [
        '.lg\\:hidden',
        '.fixed',
        'button',
        'aside',
        'nav',
        '[class*="z-50"]',
        '[class*="z-40"]',
        '[style*="position: fixed"]',
        '[style*="position:fixed"]'
      ];

      selectorsToHide.forEach(selector => {
        document.querySelectorAll(selector).forEach(el => {
          (el as HTMLElement).style.display = 'none';
        });
      });

      // Page break configuration map
      // Set to true for sections that should start on a new page
      const pageBreakMap: Record<string, boolean> = {
        'header': false,
        'performance': false,
        'insights': false,
        'flash-nist-row': true,   // Start Flash CTF/NIST row on new page
        'domain-charts': true,    // Start domain charts on new page
        'cumulative': true,       // Start cumulative chart on new page
        'activity': false,
        'challenges': false       // Challenges excluded by default
      };

      // Apply page breaks before specified sections
      Object.keys(pageBreakMap).forEach(sectionKey => {
        if (pageBreakMap[sectionKey]) {
          const section = document.querySelector(`[data-section="${sectionKey}"]`);
          if (section) {
            (section as HTMLElement).style.pageBreakBefore = 'always';
            (section as HTMLElement).style.breakBefore = 'page';
            (section as HTMLElement).style.paddingTop = '1rem';
          }
        }
      });

      // Add page break rules only for specific sections that shouldn't split
      // Header card - keep together
      document.querySelectorAll('[data-competitor-name]')?.forEach(el => {
        const parent = el.closest('.border');
        if (parent) {
          (parent as HTMLElement).style.pageBreakInside = 'avoid';
        }
      });

      // Performance cards - keep the grid together
      const perfGrid = document.querySelector('.grid.grid-cols-2');
      if (perfGrid) {
        (perfGrid as HTMLElement).style.pageBreakInside = 'avoid';
      }

      // Charts - don't split individual charts
      document.querySelectorAll('canvas')?.forEach(el => {
        const chartContainer = el.closest('.border');
        if (chartContainer) {
          (chartContainer as HTMLElement).style.pageBreakInside = 'avoid';
        }
      });
    });

    // Get competitor info and coach/school details for footer
    const pdfInfo = await page.evaluate(() => {
      const nameEl = document.querySelector('[data-competitor-name]');
      const competitorName = nameEl?.textContent || 'Competitor';

      // Extract grade and school from header
      const headerText = nameEl?.parentElement?.querySelector('div:nth-child(2)')?.textContent?.trim() || '';

      return { competitorName, headerText };
    });

    // Generate current date
    const currentDate = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    // Read logo file and convert to base64
    const logoPath = join(process.cwd(), 'public', 'guild_cmyk_logo_mark-01.png');
    const logoBuffer = readFileSync(logoPath);
    const logoBase64 = logoBuffer.toString('base64');

    // Generate PDF with footer
    const pdfBuffer = await page.pdf({
      format: 'Letter',
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: '<div></div>',
      footerTemplate: `
        <div style="width: 100%; font-size: 10px; font-family: Arial, sans-serif; padding: 10px 30px; color: #e5e7eb; background: #1e293b; display: flex; justify-content: space-between; align-items: center; -webkit-print-color-adjust: exact;">
          <div style="display: flex; align-items: center; gap: 15px;">
            <img src="data:image/png;base64,${logoBase64}" style="height: 42px; width: auto;" />
            <div style="display: flex; flex-direction: column; gap: 2px;">
              <span style="font-weight: 600;">${pdfInfo.competitorName} • ${pdfInfo.headerText}</span>
              <span style="font-size: 9px; color: #94a3b8;">Coach: ${coachName} • ${schoolName}</span>
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 20px;">
            <span>Generated: ${currentDate}</span>
            <span style="font-weight: 600;">Page <span class="pageNumber"></span></span>
          </div>
        </div>
      `,
      preferCSSPageSize: false,
      margin: {
        top: '0',
        right: '0',
        bottom: '60px',
        left: '0',
      },
    });

    await browser.close();

    // Return PDF
    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${pdfInfo.competitorName.replace(/[^a-zA-Z0-9]/g, '_')}_Report_Card.pdf"`,
      },
    });
  } catch (error: any) {
    console.error('Error generating PDF:', error);

    if (browser) {
      await browser.close().catch(() => {});
    }

    return NextResponse.json(
      { error: 'Failed to generate PDF', details: error.message },
      { status: 500 }
    );
  }
}
