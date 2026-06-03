import { useMemo, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { calculateEGeometryPatternInfo, exportLabeledSvg, generateEGeometrySvg, getEdgeAssignmentDisplayLabel, midpoint, parseSvgDocument } from './svgUtils';
import type { EdgeAssignment, EdgeSideRole, SvgDocumentModel } from './svgUtils';

type LabelPrefix = 'E' | 'S' | 'C' | 'P';

type LabelGroup = {
  prefix: LabelPrefix;
  name: string;
  description: string;
};

type EdgeConnectionProperties = {
  materialThicknessMm: number;
  fingerWidthMm: number;
  isFingerWidthManual: boolean;
  playMm: number;
  extraLengthMm: number;
  kerfMm: number;
  startOffsetMm: number;
  endOffsetMm: number;
};

type SlotConnectionProperties = {
  slotOffsetMm: number;
  slotWidthMm: number;
  slotLengthMm: number;
  isSlotLengthManual: boolean;
  materialThicknessMm: number;
  kerfMm: number;
  playMm: number;
};

type CornerConnectionProperties = {
  cornerDepthMm: number;
  isCornerDepthManual: boolean;
  materialThicknessMm: number;
  kerfMm: number;
  playMm: number;
  cornerType: string;
};

type PatternConnectionProperties = {
  patternType: string;
  patternWidthMm: number;
  materialThicknessMm: number;
  lineSpacingMm: number;
  rowOffsetMm: number;
  marginMm: number;
};

type ConnectionPropertiesByPrefix = {
  E: EdgeConnectionProperties;
  S: SlotConnectionProperties;
  C: CornerConnectionProperties;
  P: PatternConnectionProperties;
};

type EdgeConnectionDefinition = {
  id: string;
  prefix: 'E';
  properties: EdgeConnectionProperties;
};

type SlotConnectionDefinition = {
  id: string;
  prefix: 'S';
  properties: SlotConnectionProperties;
};

type CornerConnectionDefinition = {
  id: string;
  prefix: 'C';
  properties: CornerConnectionProperties;
};

type PatternConnectionDefinition = {
  id: string;
  prefix: 'P';
  properties: PatternConnectionProperties;
};

type ConnectionDefinition =
  | EdgeConnectionDefinition
  | SlotConnectionDefinition
  | CornerConnectionDefinition
  | PatternConnectionDefinition;

type ConnectionMap = Record<string, ConnectionDefinition>;

type NumericFieldProps = {
  id: string;
  label: string;
  value: number;
  min?: number;
  step?: number;
  onChange: (value: number) => void;
};

type SelectFieldProps = {
  id: string;
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
};

const labelGroups: LabelGroup[] = [
  { prefix: 'E', name: 'Edge connections', description: 'Reusable edge connection IDs' },
  { prefix: 'S', name: 'Slot connections', description: 'Reusable slot connection IDs' },
  { prefix: 'C', name: 'Corner connections', description: 'Reusable corner connection IDs' },
  { prefix: 'P', name: 'Pattern connections', description: 'Reusable pattern connection IDs' },
];

const defaultConnectionProperties: ConnectionPropertiesByPrefix = {
  E: {
    materialThicknessMm: 3,
    fingerWidthMm: 9,
    isFingerWidthManual: false,
    playMm: 0,
    extraLengthMm: 0,
    kerfMm: 0.15,
    startOffsetMm: 0,
    endOffsetMm: 0,
  },
  S: {
    slotOffsetMm: 0,
    slotWidthMm: getDefaultSlotWidth(3),
    slotLengthMm: getDefaultSlotLength(3),
    isSlotLengthManual: false,
    materialThicknessMm: 3,
    kerfMm: 0.15,
    playMm: 0,
  },
  C: {
    cornerDepthMm: getDefaultCornerDepth(3),
    isCornerDepthManual: false,
    materialThicknessMm: 3,
    kerfMm: 0.15,
    playMm: 0,
    cornerType: 'finger',
  },
  P: {
    patternType: 'line-fill',
    patternWidthMm: 20,
    materialThicknessMm: 3,
    lineSpacingMm: 5,
    rowOffsetMm: 0,
    marginMm: 2,
  },
};

const starterSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 260">
  <rect x="70" y="45" width="280" height="170" rx="0" fill="none" stroke="#000000" stroke-width="1"/>
  <line x1="70" y1="130" x2="350" y2="130" stroke="#000000" stroke-width="1"/>
</svg>`;

const getLabelPrefix = (label: string) => label.charAt(0) as LabelPrefix;

const getNextLabel = (prefix: LabelPrefix, labels: string[]) => {
  const usedNumbers = labels
    .filter((label) => getLabelPrefix(label) === prefix)
    .map((label) => Number.parseInt(label.slice(1), 10))
    .filter((value) => Number.isFinite(value));

  return `${prefix}${usedNumbers.length > 0 ? Math.max(...usedNumbers) + 1 : 1}`;
};

const sideRoleLabels: Record<EdgeSideRole, string> = {
  tab: 'Tab side',
  slot: 'Slot side',
};

const sideRoleOptions = Object.keys(sideRoleLabels) as EdgeSideRole[];
function getDefaultSlotLength(materialThicknessMm: number) {
  return materialThicknessMm * 3;
}

function getDefaultSlotWidth(materialThicknessMm: number) {
  return materialThicknessMm;
}

function getDefaultCornerDepth(materialThicknessMm: number) {
  return materialThicknessMm * 3;
}

const getAssignedConnectionId = (assignment: EdgeAssignment | undefined) => assignment?.connectionId;

const formatCalculatedMm = (value: number) => `${Number(value.toFixed(2)).toString()} mm`;

const cloneDefaultProperties = <P extends LabelPrefix>(prefix: P): ConnectionPropertiesByPrefix[P] => ({
  ...defaultConnectionProperties[prefix],
});

const createConnectionDefinition = (id: string, prefix: LabelPrefix): ConnectionDefinition => {
  if (prefix === 'E') {
    return { id, prefix, properties: cloneDefaultProperties(prefix) };
  }

  if (prefix === 'S') {
    return { id, prefix, properties: cloneDefaultProperties(prefix) };
  }

  if (prefix === 'C') {
    return { id, prefix, properties: cloneDefaultProperties(prefix) };
  }

  return { id, prefix, properties: cloneDefaultProperties(prefix) };
};

const NumericField = ({ id, label, value, min, step = 0.1, onChange }: NumericFieldProps) => (
  <label className="property-field" htmlFor={id}>
    <span>{label}</span>
    <input
      id={id}
      type="number"
      min={min}
      step={step}
      value={value}
      onChange={(event) => onChange(Number.isFinite(event.target.valueAsNumber) ? event.target.valueAsNumber : 0)}
    />
  </label>
);

const SelectField = ({ id, label, value, options, onChange }: SelectFieldProps) => (
  <label className="property-field" htmlFor={id}>
    <span>{label}</span>
    <select id={id} value={value} onChange={(event) => onChange(event.target.value)}>
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  </label>
);

function App() {
  const [svgModel, setSvgModel] = useState<SvgDocumentModel>(() => parseSvgDocument(starterSvg));
  const [edgeAssignments, setEdgeAssignments] = useState<Record<string, EdgeAssignment>>({});
  const [connections, setConnections] = useState<ConnectionMap>({});
  const [selectedLabelId, setSelectedLabelId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const downloadRef = useRef<HTMLAnchorElement>(null);

  const availableLabels = useMemo(() => Object.keys(connections), [connections]);
  const selectedConnection = selectedLabelId ? connections[selectedLabelId] ?? null : null;
  const selectedEdge = svgModel.edges.find((edge) => edge.id === selectedEdgeId) ?? null;

  const labelCounts = useMemo(() => {
    return availableLabels.reduce<Record<string, number>>((counts, label) => {
      counts[label] = Object.values(edgeAssignments).filter((assignment) => assignment.connectionId === label).length;
      return counts;
    }, {});
  }, [availableLabels, edgeAssignments]);

  const labelsByGroup = useMemo(() => {
    return labelGroups.map((group) => ({
      ...group,
      labels: availableLabels.filter((label) => getLabelPrefix(label) === group.prefix),
    }));
  }, [availableLabels]);

  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const text = await file.text();
    const parsedSvg = parseSvgDocument(text);
    setSvgModel(parsedSvg);
    setEdgeAssignments({});
    setSelectedEdgeId(null);
    setErrorMessage('');
    event.target.value = '';
  };

  const handleImportWithError = (event: ChangeEvent<HTMLInputElement>) => {
    handleImport(event).catch((error: Error) => {
      setErrorMessage(error.message);
    });
  };

  const createLabel = (prefix: LabelPrefix) => {
    const nextLabel = getNextLabel(prefix, availableLabels);
    setConnections((currentConnections) => ({
      ...currentConnections,
      [nextLabel]: createConnectionDefinition(nextLabel, prefix),
    }));
    setSelectedLabelId(nextLabel);
    setErrorMessage('');
  };

  const getDefaultEdgeSideRole = (connectionId: string, assignments: Record<string, EdgeAssignment>): EdgeSideRole => {
    const rolesForConnection = Object.values(assignments)
      .filter((assignment) => assignment.connectionId === connectionId)
      .map((assignment) => assignment.slotRole);

    if (!rolesForConnection.includes('tab')) {
      return 'tab';
    }

    if (!rolesForConnection.includes('slot')) {
      return 'slot';
    }

    return 'tab';
  };

  const getAssignedEEdges = (connectionId: string, assignments: Record<string, EdgeAssignment>) => (
    Object.entries(assignments).filter(([, assignment]) => assignment.connectionId === connectionId)
  );

  const isEConnectionFull = (connectionId: string, assignments: Record<string, EdgeAssignment>) => (
    getAssignedEEdges(connectionId, assignments).length >= 2
  );

  const findNextAvailableLabel = (prefix: LabelPrefix, labels: string[]) => {
    const usedNumbers = new Set(
      labels
        .filter((label) => getLabelPrefix(label) === prefix)
        .map((label) => Number.parseInt(label.slice(1), 10))
        .filter((value) => Number.isFinite(value)),
    );

    let nextNumber = 1;
    while (usedNumbers.has(nextNumber)) {
      nextNumber += 1;
    }

    return `${prefix}${nextNumber}`;
  };

  const clearEdgeLabel = (edgeId: string) => {
    setEdgeAssignments((currentAssignments) => {
      const nextAssignments = { ...currentAssignments };
      delete nextAssignments[edgeId];
      return nextAssignments;
    });
    setErrorMessage('');
  };

  const assignSelectedLabelToEdge = (edgeId: string) => {
    setSelectedEdgeId(edgeId);

    if (!selectedLabelId) {
      setErrorMessage('Create and select a connection before clicking an edge.');
      return;
    }

    const connection = connections[selectedLabelId];
    if (!connection) {
      setErrorMessage('Select a valid connection before clicking an edge.');
      return;
    }

    let targetLabelId = selectedLabelId;
    let targetConnection = connection;
    let warningMessage = '';

    if (connection.prefix === 'E' && edgeAssignments[edgeId]?.connectionId !== selectedLabelId && isEConnectionFull(selectedLabelId, edgeAssignments)) {
      targetLabelId = findNextAvailableLabel('E', availableLabels);
      targetConnection = createConnectionDefinition(targetLabelId, 'E') as EdgeConnectionDefinition;
      setConnections((currentConnections) => ({
        ...currentConnections,
        [targetLabelId]: targetConnection,
      }));
      setSelectedLabelId(targetLabelId);
      warningMessage = `${selectedLabelId} already has 2 edges. Switched to ${targetLabelId}.`;
    }

    setEdgeAssignments((currentAssignments) => ({
      ...currentAssignments,
      [edgeId]: {
        connectionId: targetLabelId,
        ...(targetConnection.prefix === 'E' || targetConnection.prefix === 'S'
          ? { slotRole: currentAssignments[edgeId]?.connectionId === targetLabelId
            ? currentAssignments[edgeId]?.slotRole ?? getDefaultEdgeSideRole(targetLabelId, currentAssignments)
            : getDefaultEdgeSideRole(targetLabelId, currentAssignments) }
          : {}),
      },
    }));
    setErrorMessage(warningMessage);
  };

  const clearSelectedLabel = () => {
    if (!selectedEdgeId) {
      return;
    }

    clearEdgeLabel(selectedEdgeId);
  };

  const updateEdgeProperties = (updates: Partial<EdgeConnectionProperties>) => {
    if (!selectedConnection || selectedConnection.prefix !== 'E') {
      return;
    }

    const nextProperties: EdgeConnectionProperties = {
      ...selectedConnection.properties,
      ...updates,
    };

    if (updates.materialThicknessMm !== undefined && !selectedConnection.properties.isFingerWidthManual) {
      nextProperties.fingerWidthMm = updates.materialThicknessMm * 3;
    }

    if (updates.fingerWidthMm !== undefined) {
      nextProperties.isFingerWidthManual = true;
    }

    const nextConnection: EdgeConnectionDefinition = {
      ...selectedConnection,
      properties: nextProperties,
    };
    setConnections((currentConnections) => ({
      ...currentConnections,
      [nextConnection.id]: nextConnection,
    }));
  };

  const updateSlotProperties = (updates: Partial<SlotConnectionProperties>) => {
    if (!selectedConnection || selectedConnection.prefix !== 'S') {
      return;
    }

    const nextProperties: SlotConnectionProperties = {
      ...selectedConnection.properties,
      ...updates,
    };

    if (updates.materialThicknessMm !== undefined) {
      nextProperties.slotWidthMm = getDefaultSlotWidth(updates.materialThicknessMm);

      if (!selectedConnection.properties.isSlotLengthManual) {
        nextProperties.slotLengthMm = getDefaultSlotLength(updates.materialThicknessMm);
      }
    }

    if (updates.slotLengthMm !== undefined) {
      nextProperties.isSlotLengthManual = true;
    }

    const nextConnection: SlotConnectionDefinition = {
      ...selectedConnection,
      properties: nextProperties,
    };
    setConnections((currentConnections) => ({
      ...currentConnections,
      [nextConnection.id]: nextConnection,
    }));
  };

  const updateEdgeSideRole = (edgeId: string, slotRole: EdgeSideRole) => {
    if (!selectedConnection || (selectedConnection.prefix !== 'E' && selectedConnection.prefix !== 'S')) {
      return;
    }

    const hasDuplicateERole = selectedConnection.prefix === 'E' && Object.entries(edgeAssignments).some(([assignedEdgeId, assignedEdge]) => (
      assignedEdgeId !== edgeId
      && assignedEdge.connectionId === selectedConnection.id
      && assignedEdge.slotRole === slotRole
    ));

    if (hasDuplicateERole) {
      setErrorMessage(`${selectedConnection.id} already has an ${selectedConnection.id}-${slotRole === 'tab' ? 'T' : 'S'} edge.`);
      return;
    }

    setEdgeAssignments((currentAssignments) => {
      const assignment = currentAssignments[edgeId];
      if (!assignment || assignment.connectionId !== selectedConnection.id) {
        return currentAssignments;
      }

      return {
        ...currentAssignments,
        [edgeId]: {
          ...assignment,
          slotRole,
        },
      };
    });
    setErrorMessage('');
  };

  const updateCornerProperties = (updates: Partial<CornerConnectionProperties>) => {
    if (!selectedConnection || selectedConnection.prefix !== 'C') {
      return;
    }

    const nextProperties: CornerConnectionProperties = {
      ...selectedConnection.properties,
      ...updates,
    };

    if (updates.materialThicknessMm !== undefined && !selectedConnection.properties.isCornerDepthManual) {
      nextProperties.cornerDepthMm = getDefaultCornerDepth(updates.materialThicknessMm);
    }

    if (updates.cornerDepthMm !== undefined) {
      nextProperties.isCornerDepthManual = true;
    }

    const nextConnection: CornerConnectionDefinition = {
      ...selectedConnection,
      properties: nextProperties,
    };
    setConnections((currentConnections) => ({
      ...currentConnections,
      [nextConnection.id]: nextConnection,
    }));
  };

  const updatePatternProperties = (updates: Partial<PatternConnectionProperties>) => {
    if (!selectedConnection || selectedConnection.prefix !== 'P') {
      return;
    }

    const nextConnection: PatternConnectionDefinition = {
      ...selectedConnection,
      properties: { ...selectedConnection.properties, ...updates },
    };
    setConnections((currentConnections) => ({
      ...currentConnections,
      [nextConnection.id]: nextConnection,
    }));
  };

  const generateEGeometryPreview = () => {
    const eConnections = Object.fromEntries(
      Object.entries(connections).filter(([, connection]) => connection.prefix === 'E'),
    ) as Record<string, EdgeConnectionDefinition>;

    try {
      const output = generateEGeometrySvg(svgModel.content, edgeAssignments, svgModel.edges, eConnections);
      const parsedSvg = parseSvgDocument(output);
      setSvgModel(parsedSvg);
      setEdgeAssignments({});
      setSelectedEdgeId(null);
      setErrorMessage('Generated E geometry preview. Assignments were cleared because the original straight edges were replaced.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to generate E geometry.');
    }
  };

  const exportSvg = () => {
    const output = exportLabeledSvg(svgModel.content, edgeAssignments, svgModel.edges);
    const blob = new Blob([output], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);

    if (downloadRef.current) {
      downloadRef.current.href = url;
      downloadRef.current.download = 'svg-box-designer-labeled.svg';
      downloadRef.current.click();
    }

    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const renderSideRoleSection = (connectionId: string, connectionPrefix: 'E' | 'S') => {
    const assignedRoleEdges = svgModel.edges.filter((edge) => edgeAssignments[edge.id]?.connectionId === connectionId);
    const hasTabSide = assignedRoleEdges.some((edge) => edgeAssignments[edge.id]?.slotRole === 'tab');
    const hasSlotSide = assignedRoleEdges.some((edge) => edgeAssignments[edge.id]?.slotRole === 'slot');
    const sectionId = `${connectionPrefix.toLowerCase()}-edge-roles`;

    return (
      <section className="property-section" aria-labelledby={sectionId}>
        <h4 id={sectionId}>Assigned edges</h4>
        {assignedRoleEdges.length > 0 ? (
          <>
            {(!hasTabSide || !hasSlotSide) && (
              <p className="role-warning">{connectionPrefix} labels normally need at least one Tab side and one Slot side edge.</p>
            )}
            <ul className="assigned-edge-list">
              {assignedRoleEdges.map((edge) => {
                const assignment = edgeAssignments[edge.id];
                return (
                  <li key={edge.id}>
                    <div>
                      <strong>{edge.id}</strong>
                      <span>{edge.source}</span>
                    </div>
                    <div className="assigned-edge-actions">
                      <select
                        aria-label={`${edge.id} ${connectionPrefix} side role`}
                        value={assignment?.slotRole ?? 'tab'}
                        onChange={(event) => updateEdgeSideRole(edge.id, event.target.value as EdgeSideRole)}
                      >
                        {sideRoleOptions.map((role) => (
                          <option key={role} value={role}>
                            {sideRoleLabels[role]}
                          </option>
                        ))}
                      </select>
                      {connectionPrefix === 'E' && (
                        <button type="button" onClick={() => clearEdgeLabel(edge.id)}>
                          Remove
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        ) : (
          <p className="muted">No edges assigned to this {connectionPrefix} label yet. Select this label, then click edges in the drawing.</p>
        )}
      </section>
    );
  };

  const renderPropertiesPanel = () => {
    if (!selectedConnection) {
      return <p className="muted">Select E1, S1, C1, or P1 to edit its saved connection properties.</p>;
    }

    if (selectedConnection.prefix === 'E') {
      const properties = selectedConnection.properties;
      const assignedEEdges = svgModel.edges.filter((edge) => edgeAssignments[edge.id]?.connectionId === selectedConnection.id);
      return (
        <div className="property-sections">
          {renderSideRoleSection(selectedConnection.id, selectedConnection.prefix)}

          <section className="property-section" aria-labelledby="edge-calculated-properties">
            <h4 id="edge-calculated-properties">Calculated geometry</h4>
            {assignedEEdges.length > 0 ? (
              <ul className="calculated-edge-list">
                {assignedEEdges.map((edge) => {
                  const length = Math.hypot(edge.end.x - edge.start.x, edge.end.y - edge.start.y);
                  const info = calculateEGeometryPatternInfo(length, properties);

                  return (
                    <li key={edge.id}>
                      <strong>{edge.id}</strong>
                      <dl>
                        <div>
                          <dt>Requested finger width</dt>
                          <dd>{formatCalculatedMm(properties.fingerWidthMm)}</dd>
                        </div>
                        <div>
                          <dt>Middle finger width</dt>
                          <dd>{info.segmentCount > 2 ? formatCalculatedMm(info.middleSegmentWidthMm) : 'No middle fingers'}</dd>
                        </div>
                        <div>
                          <dt>First/last finger or slot width</dt>
                          <dd>{info.segmentCount > 0 ? formatCalculatedMm(info.firstLastSegmentWidthMm) : 'No full segments'}</dd>
                        </div>
                        <div>
                          <dt>Number of tabs</dt>
                          <dd>{info.tabCount}</dd>
                        </div>
                        <div>
                          <dt>Number of gaps</dt>
                          <dd>{info.gapCount}</dd>
                        </div>
                        <div>
                          <dt>End margin</dt>
                          <dd>{formatCalculatedMm(info.endMarginMm)}</dd>
                        </div>
                      </dl>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="muted">Assign this E label to an edge to preview its fitted finger width, tab count, and end margin.</p>
            )}
          </section>

          <section className="property-section" aria-labelledby="edge-basic-properties">
            <h4 id="edge-basic-properties">Basic</h4>
            <div className="property-grid">
              <NumericField id="edge-finger-width" label="Finger width (mm)" min={0} value={properties.fingerWidthMm} onChange={(fingerWidthMm) => updateEdgeProperties({ fingerWidthMm })} />
              <NumericField id="edge-material-thickness" label="Material thickness (mm)" min={0} value={properties.materialThicknessMm} onChange={(materialThicknessMm) => updateEdgeProperties({ materialThicknessMm })} />
            </div>
          </section>

          <section className="property-section" aria-labelledby="edge-advanced-properties">
            <h4 id="edge-advanced-properties">Advanced</h4>
            <div className="property-grid">
              <NumericField id="edge-kerf" label="Kerf (mm)" min={0} value={properties.kerfMm} onChange={(kerfMm) => updateEdgeProperties({ kerfMm })} />
              <NumericField id="edge-play" label="Play (mm)" min={0} value={properties.playMm} onChange={(playMm) => updateEdgeProperties({ playMm })} />
              <NumericField id="edge-start-offset" label="Start offset (mm)" min={0} value={properties.startOffsetMm} onChange={(startOffsetMm) => updateEdgeProperties({ startOffsetMm })} />
              <NumericField id="edge-end-offset" label="End offset (mm)" min={0} value={properties.endOffsetMm} onChange={(endOffsetMm) => updateEdgeProperties({ endOffsetMm })} />
              <NumericField id="edge-extra-length" label="Extra length (mm)" value={properties.extraLengthMm} onChange={(extraLengthMm) => updateEdgeProperties({ extraLengthMm })} />
            </div>
          </section>
        </div>
      );
    }

    if (selectedConnection.prefix === 'S') {
      const properties = selectedConnection.properties;

      return (
        <div className="property-sections">
          {renderSideRoleSection(selectedConnection.id, selectedConnection.prefix)}

          <section className="property-section" aria-labelledby="slot-basic-properties">
            <h4 id="slot-basic-properties">Basic</h4>
            <div className="property-grid">
              <NumericField id="slot-offset" label="Slot offset from edge (mm)" value={properties.slotOffsetMm} onChange={(slotOffsetMm) => updateSlotProperties({ slotOffsetMm })} />
              <NumericField id="slot-material-thickness" label="Material thickness (mm)" min={0} value={properties.materialThicknessMm} onChange={(materialThicknessMm) => updateSlotProperties({ materialThicknessMm })} />
              <NumericField id="slot-length" label="Slot length (mm)" min={0} value={properties.slotLengthMm} onChange={(slotLengthMm) => updateSlotProperties({ slotLengthMm })} />
            </div>
          </section>

          <section className="property-section" aria-labelledby="slot-advanced-properties">
            <h4 id="slot-advanced-properties">Advanced</h4>
            <div className="property-grid">
              <NumericField id="slot-kerf" label="Kerf (mm)" min={0} value={properties.kerfMm} onChange={(kerfMm) => updateSlotProperties({ kerfMm })} />
              <NumericField id="slot-play" label="Play (mm)" min={0} value={properties.playMm} onChange={(playMm) => updateSlotProperties({ playMm })} />
            </div>
          </section>
        </div>
      );
    }

    if (selectedConnection.prefix === 'C') {
      const properties = selectedConnection.properties;
      return (
        <div className="property-sections">
          <section className="property-section" aria-labelledby="corner-basic-properties">
            <h4 id="corner-basic-properties">Basic</h4>
            <div className="property-grid">
              <NumericField id="corner-depth" label="Corner depth (mm)" min={0} value={properties.cornerDepthMm} onChange={(cornerDepthMm) => updateCornerProperties({ cornerDepthMm })} />
              <NumericField id="corner-material-thickness" label="Material thickness (mm)" min={0} value={properties.materialThicknessMm} onChange={(materialThicknessMm) => updateCornerProperties({ materialThicknessMm })} />
            </div>
          </section>

          <section className="property-section" aria-labelledby="corner-advanced-properties">
            <h4 id="corner-advanced-properties">Advanced</h4>
            <div className="property-grid">
              <NumericField id="corner-kerf" label="Kerf (mm)" min={0} value={properties.kerfMm} onChange={(kerfMm) => updateCornerProperties({ kerfMm })} />
              <NumericField id="corner-play" label="Play (mm)" min={0} value={properties.playMm} onChange={(playMm) => updateCornerProperties({ playMm })} />
              <SelectField id="corner-type" label="Corner type" value={properties.cornerType} options={['finger', 'miter', 'butt', 'rounded']} onChange={(cornerType) => updateCornerProperties({ cornerType })} />
            </div>
          </section>
        </div>
      );
    }

    const properties = selectedConnection.properties;
    return (
      <div className="property-sections">
        <section className="property-section" aria-labelledby="pattern-basic-properties">
          <h4 id="pattern-basic-properties">Basic</h4>
          <div className="property-grid">
            <SelectField id="pattern-type" label="Pattern type" value={properties.patternType} options={['line-fill', 'dash', 'perforation', 'hatch']} onChange={(patternType) => updatePatternProperties({ patternType })} />
            <NumericField id="pattern-width" label="Pattern width (mm)" min={0} value={properties.patternWidthMm} onChange={(patternWidthMm) => updatePatternProperties({ patternWidthMm })} />
            <NumericField id="pattern-material-thickness" label="Material thickness (mm)" min={0} value={properties.materialThicknessMm} onChange={(materialThicknessMm) => updatePatternProperties({ materialThicknessMm })} />
          </div>
        </section>

        <section className="property-section" aria-labelledby="pattern-advanced-properties">
          <h4 id="pattern-advanced-properties">Advanced</h4>
          <div className="property-grid">
            <NumericField id="pattern-line-spacing" label="Line spacing (mm)" min={0} value={properties.lineSpacingMm} onChange={(lineSpacingMm) => updatePatternProperties({ lineSpacingMm })} />
            <NumericField id="pattern-row-offset" label="Row offset (mm)" value={properties.rowOffsetMm} onChange={(rowOffsetMm) => updatePatternProperties({ rowOffsetMm })} />
            <NumericField id="pattern-margin" label="Margin (mm)" min={0} value={properties.marginMm} onChange={(marginMm) => updatePatternProperties({ marginMm })} />
          </div>
        </section>
      </div>
    );
  };

  return (
    <main className="app-shell">
      <header className="hero">
        <div>
          <p className="eyebrow">Reusable connection definitions</p>
          <h1>SVG Box Designer</h1>
          <p>
            Import your own SVG design, then define reusable finger joints, slots, corner connections, and bend patterns for its existing edges.
          </p>
        </div>
        <div className="hero-actions">
          <label className="button primary">
            Import SVG
            <input type="file" accept=".svg,image/svg+xml" onChange={handleImportWithError} />
          </label>
          <button className="button" type="button" onClick={generateEGeometryPreview}>
            Generate E Geometry
          </button>
          <button className="button" type="button" onClick={exportSvg} disabled={Object.keys(edgeAssignments).length === 0}>
            Export SVG
          </button>
          <a ref={downloadRef} className="visually-hidden" aria-hidden="true">
            download
          </a>
        </div>
      </header>

      {errorMessage && <div className="notice">{errorMessage}</div>}

      <section className="workspace" aria-label="SVG connection workspace">
        <aside className="panel">
          <h2>Connection manager</h2>
          <p className="muted">
            Create a connection, select it, tune its parameters, then click edges from your custom SVG. This app labels your design for future connection generation instead of generating a standard box.
          </p>

          <div className="active-label-card" aria-live="polite">
            <span>Selected connection</span>
            <strong>{selectedLabelId ?? 'None'}</strong>
          </div>

          <div className="label-manager">
            {labelsByGroup.map(({ prefix, name, description, labels: groupLabels }) => (
              <section className="label-group" key={prefix} aria-label={name}>
                <div className="label-group-header">
                  <div>
                    <h3>{prefix} = {name}</h3>
                    <p>{description}</p>
                  </div>
                  <button type="button" onClick={() => createLabel(prefix)}>
                    Add {getNextLabel(prefix, availableLabels)}
                  </button>
                </div>

                {groupLabels.length > 0 ? (
                  <ul className="label-list">
                    {groupLabels.map((label) => (
                      <li key={label}>
                        <button
                          type="button"
                          className={selectedLabelId === label ? 'selected-label' : ''}
                          onClick={() => {
                            setSelectedLabelId(label);
                            setErrorMessage('');
                          }}
                        >
                          <strong>{label}</strong>
                          <span>{labelCounts[label] ?? 0} {(labelCounts[label] ?? 0) === 1 ? 'edge' : 'edges'}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="empty-labels">No {prefix} connections yet.</p>
                )}
              </section>
            ))}
          </div>

          <div className="properties-card">
            <div>
              <p className="eyebrow">Properties</p>
              <h3>{selectedConnection ? `${selectedConnection.id} parameters` : 'No connection selected'}</h3>
            </div>
            {renderPropertiesPanel()}
          </div>

          <div className="selection-card">
            <h3>Selection</h3>
            {selectedEdge ? (
              <dl>
                <dt>Edge</dt>
                <dd>{selectedEdge.id}</dd>
                <dt>Source</dt>
                <dd>{selectedEdge.source}</dd>
                <dt>Connection</dt>
                <dd>{getAssignedConnectionId(edgeAssignments[selectedEdge.id]) ?? 'Unassigned'}</dd>
              </dl>
            ) : (
              <p className="muted">No edge selected.</p>
            )}
            <button type="button" onClick={clearSelectedLabel} disabled={!selectedEdgeId || !edgeAssignments[selectedEdgeId]}>
              Clear selected edge label
            </button>
          </div>
        </aside>

        <section className="canvas-card">
          <div className="canvas-toolbar">
            <div>
              <h2>Drawing</h2>
              <p>{svgModel.edges.length} selectable straight edges detected.</p>
            </div>
          </div>

          <div className="canvas-frame">
            <svg className="design-svg" viewBox={svgModel.viewBox} role="img" aria-label="Imported SVG with selectable edges">
              <g className="drawing-layer" dangerouslySetInnerHTML={{ __html: svgModel.innerMarkup }} />
              <g className="edge-overlays">
                {svgModel.edges.map((edge) => {
                  const assignment = edgeAssignments[edge.id];
                  const label = getEdgeAssignmentDisplayLabel(assignment);
                  const center = midpoint(edge);
                  const selected = selectedEdgeId === edge.id;

                  return (
                    <g key={edge.id}>
                      {(label || selected) && (
                        <line
                          className={`edge-highlight${label ? ' labeled' : ''}${selected ? ' selected' : ''}`}
                          x1={edge.start.x}
                          y1={edge.start.y}
                          x2={edge.end.x}
                          y2={edge.end.y}
                        />
                      )}
                      <line
                        className="edge-hitbox"
                        x1={edge.start.x}
                        y1={edge.start.y}
                        x2={edge.end.x}
                        y2={edge.end.y}
                        onClick={() => assignSelectedLabelToEdge(edge.id)}
                      />
                      {label && (
                        <text className="edge-label" x={center.x} y={center.y} textAnchor="middle" dominantBaseline="middle">
                          {label}
                        </text>
                      )}
                    </g>
                  );
                })}
              </g>
            </svg>
          </div>
        </section>
      </section>
    </main>
  );
}

export default App;
