import { NextRequest, NextResponse } from 'next/server';
import { MondayClient } from '@/lib/integrations/monday';

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();
    
    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    const mondayClient = new MondayClient();
    const coach = await mondayClient.getCoachByEmail(email);
    
    if (!coach) {
      return NextResponse.json({ 
        exists: false, 
        isApproved: false,
        message: 'Coach not found in Monday.com'
      });
    }

    if (!coach.isApproved) {
      return NextResponse.json({ 
        exists: true, 
        isApproved: false,
        message: 'Coach found but not yet approved'
      });
    }

    return NextResponse.json({ 
      exists: true, 
      isApproved: true,
      coach: {
        mondayId: coach.id,
        email: coach.email,
        fullName: coach.fullName,
        firstName: coach.firstName,
        lastName: coach.lastName,
        schoolName: coach.schoolName,
        mobileNumber: coach.mobileNumber,
        division: coach.division,
        region: coach.region,
        liveScanCompleted: coach.liveScanCompleted,
        mandatedReporterCompleted: coach.mandatedReporterCompleted
      }
    });

  } catch (error: any) {
    console.error('Error verifying coach:', error);
    return NextResponse.json({ 
      error: 'Error verifying coach',
      details: error.message 
    }, { status: 500 });
  }
}
