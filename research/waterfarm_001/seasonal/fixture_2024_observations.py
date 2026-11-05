"""Research fixture from enumerated 2024 Yakima NOAA PRCP dates/values.

NOT the original source file: reconstructs numeric values and traces from
individually audited station rows; source attribution flag in this *fixture*
is a placeholder W and is never claimed to match original station metadata.
Refer to the exact NOAA API raw CSV preserved separately in GitHub RC05.
"""
from datetime import date,timedelta
WET='''01-02=2.5;01-03=3.0;01-08=1.3;01-09=0.3;01-10=0.3;01-11=0.3;01-12=3.3;01-13=0.3;01-17=2.0;01-18=9.7;01-19=1.8;01-21=4.8;01-22=2.5;01-23=1.0;01-24=3.3;01-26=1.8;01-27=3.0;01-30=0.5;01-31=6.9;02-05=4.8;02-14=1.0;02-15=3.3;02-18=0.3;02-19=3.0;02-21=0.8;03-01=0.3;03-02=1.0;03-09=0.3;03-22=1.0;03-23=10.2;03-27=1.0;03-28=1.0;04-04=1.0;04-25=2.3;04-29=0.5;05-02=0.5;05-04=4.1;05-05=0.3;05-06=0.3;05-21=1.5;05-24=0.3;06-02=0.3;06-03=0.8;07-17=0.3;07-29=1.0;08-03=0.3;08-17=3.8;08-18=0.8;08-20=1.0;08-23=1.3;09-11=1.3;09-13=0.3;10-04=0.3;10-15=0.3;10-16=1.0;10-21=0.3;10-27=2.8;10-30=0.8;10-31=1.5;11-01=0.8;11-02=0.3;11-04=0.3;11-09=0.8;11-10=1.0;11-11=0.8;11-12=0.3;11-13=2.0;11-19=11.7;11-20=6.4;11-21=1.5;11-22=18.3;11-23=3.3;11-24=1.8;12-12=0.5;12-13=8.1;12-16=4.6;12-17=3.0;12-18=1.3;12-21=2.5;12-22=2.0;12-23=2.0;12-24=3.8;12-25=7.4;12-26=4.6;12-27=6.4;12-29=11.7;12-31=0.3'''
TRACES='''01-04;01-16;01-20;02-01;02-04;02-06;02-11;02-20;02-25;03-11;04-12;04-20;04-26;05-22;05-23;06-09;08-05;08-24;09-03;09-14;09-22;09-25;10-18;10-20;10-25;10-26;11-16;11-25;12-07;12-14;12-15'''

def generate_csv():
    wet={k:float(v) for k,v in (pair.split('=') for pair in WET.split(';'))}
    traces=set(TRACES.split(';'))
    assert not traces.intersection(wet)
    lines=['"STATION","DATE","PRCP","PRCP_ATTRIBUTES"']
    d=date(2024,1,1)
    while d.year==2024:
        k=d.strftime('%m-%d')
        lines.append(f'"USW00024243","{d.isoformat()}","{wet.get(k,0.0):.1f}","{("T" if k in traces else "")},,W,2400"')
        d+=timedelta(days=1)
    return '\n'.join(lines)+'\n'
