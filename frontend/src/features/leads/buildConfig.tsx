import { Wrench, Sun, Battery, PlugZap, Home, DollarSign, TrendingDown } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

// Leads captured by the website's "Build Your System" configurator carry
// origin markers + a structured build_* payload in customFormResponses.
export function isBuildLead(custom: Record<string, unknown> | null | undefined): boolean {
  return custom?.lead_source === 'build_configurator';
}

export function BuildBadge() {
  return (
    <Badge variant="secondary" className="gap-1 border-primary/30 bg-primary/10 text-primary">
      <Wrench className="h-3 w-3" /> Build
    </Badge>
  );
}

const money = (v: unknown) => (typeof v === 'number' ? `$${v.toLocaleString()}` : String(v));
const str = (v: unknown) => (v === undefined || v === null || v === '' ? null : String(v));

const PHASE_LABEL: Record<string, string> = { '1P': 'Single-phase', '3P': 'Three-phase' };
const ORIENTATION_LABEL: Record<string, string> = { N: 'North', 'E/W': 'East/West', S: 'South' };
const SHADING_LABEL: Record<string, string> = { none: 'No shade', partial: 'Partial shade', heavy: 'Heavy shade' };

// Keys rendered by the dedicated rows below — anything else build_* falls into
// the generic list so future fields still show without a CRM change.
const KNOWN = new Set([
  'build_solar_kw', 'build_panel_count', 'build_brand', 'build_inverter', 'build_battery',
  'build_ev_charger', 'build_supply_phase', 'build_roof_sqft', 'build_roof_orientation',
  'build_roof_shading', 'build_est_total_low', 'build_est_total_high', 'build_est_saving_low',
  'build_est_saving_high', 'build_est_payback_years',
]);

function Row({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium">{value}</p>
      </div>
    </div>
  );
}

export function BuildConfigCard({ custom }: { custom: Record<string, unknown> }) {
  const solar = str(custom.build_solar_kw)
    ? `${custom.build_solar_kw} kW${str(custom.build_panel_count) ? ` (${custom.build_panel_count} panels)` : ''}${str(custom.build_brand) ? ` · ${custom.build_brand}` : ''}`
    : null;
  const supply = str(custom.build_supply_phase)
    ? PHASE_LABEL[String(custom.build_supply_phase)] ?? String(custom.build_supply_phase)
    : null;
  const roofParts = [
    str(custom.build_roof_sqft) ? `${Number(custom.build_roof_sqft).toLocaleString()} sq ft` : null,
    str(custom.build_roof_orientation) ? ORIENTATION_LABEL[String(custom.build_roof_orientation)] ?? String(custom.build_roof_orientation) : null,
    str(custom.build_roof_shading) ? SHADING_LABEL[String(custom.build_roof_shading)] ?? String(custom.build_roof_shading) : null,
  ].filter(Boolean);
  const invest =
    str(custom.build_est_total_low) && str(custom.build_est_total_high)
      ? `${money(custom.build_est_total_low)} – ${money(custom.build_est_total_high)}`
      : null;
  const saving =
    str(custom.build_est_saving_low) && str(custom.build_est_saving_high)
      ? `${money(custom.build_est_saving_low)} – ${money(custom.build_est_saving_high)}/yr${str(custom.build_est_payback_years) ? ` · payback ${custom.build_est_payback_years} yrs` : ''}`
      : null;
  const extras = Object.entries(custom).filter(
    ([k, v]) => k.startsWith('build_') && !KNOWN.has(k) && v !== null && v !== '' && v !== undefined,
  );

  return (
    <Card className="border-primary/30">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Wrench className="h-4 w-4 text-primary" /> Build Your System
          {typeof custom.source_page === 'string' && (
            <span className="ml-auto text-xs font-normal text-muted-foreground">{custom.source_page}</span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Row icon={Sun} label="Solar system" value={solar} />
        <Row icon={PlugZap} label="Inverter" value={str(custom.build_inverter)} />
        <Row icon={Battery} label="Battery" value={str(custom.build_battery)} />
        <Row icon={PlugZap} label="EV charger" value={str(custom.build_ev_charger)} />
        <Row icon={PlugZap} label="Supply" value={supply} />
        <Row icon={Home} label="Roof" value={roofParts.length ? roofParts.join(' · ') : null} />
        <Row icon={DollarSign} label="Estimated investment (after rebates, incl. GST)" value={invest} />
        <Row icon={TrendingDown} label="Estimated saving" value={saving} />
        {extras.length > 0 && (
          <div className="space-y-1 border-t pt-2">
            {extras.map(([k, v]) => (
              <p key={k} className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{k.replace(/^build_/, '').replace(/_/g, ' ')}:</span> {String(v)}
              </p>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
