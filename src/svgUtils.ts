export type Point = {
  x: number;
  y: number;
};

export type SvgEdge = {
  id: string;
  source: string;
  start: Point;
  end: Point;
};

export type SlotEdgeRole = 'tab' | 'slot';

export type EdgeAssignment = {
  connectionId: string;
  slotRole?: SlotEdgeRole;
};

export type SvgDocumentModel = {
  content: string;
  innerMarkup: string;
  viewBox: string;
  width: number;
  height: number;
  edges: SvgEdge[];
};

const defaultCanvas = {
  viewBox: '0 0 800 600',
  width: 800,
  height: 600,
};

const svgNumber = (value: string | null, fallback = 0) => {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const parsePoints = (points: string | null): Point[] => {
  if (!points) {
    return [];
  }

  const values = points
    .trim()
    .split(/[\s,]+/)
    .map(Number)
    .filter((value) => Number.isFinite(value));

  const parsedPoints: Point[] = [];
  for (let index = 0; index < values.length - 1; index += 2) {
    parsedPoints.push({ x: values[index], y: values[index + 1] });
  }

  return parsedPoints;
};

const addEdge = (
  edges: SvgEdge[],
  source: string,
  start: Point,
  end: Point,
) => {
  if (start.x === end.x && start.y === end.y) {
    return;
  }

  edges.push({
    id: `edge-${edges.length + 1}`,
    source,
    start,
    end,
  });
};

const parsePathSegments = (pathData: string | null, source: string, edges: SvgEdge[]) => {
  if (!pathData) {
    return;
  }

  const tokens = pathData.match(/[a-zA-Z]|[-+]?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? [];
  let index = 0;
  let command = '';
  let current: Point = { x: 0, y: 0 };
  let subpathStart: Point = { x: 0, y: 0 };

  const isCommand = (token: string) => /^[a-zA-Z]$/.test(token);
  const readNumber = () => Number.parseFloat(tokens[index++]);

  while (index < tokens.length) {
    if (isCommand(tokens[index])) {
      command = tokens[index++];
    }

    const relative = command === command.toLowerCase();
    const upperCommand = command.toUpperCase();

    if (upperCommand === 'M') {
      const x = readNumber();
      const y = readNumber();
      current = {
        x: relative ? current.x + x : x,
        y: relative ? current.y + y : y,
      };
      subpathStart = current;
      command = relative ? 'l' : 'L';
    } else if (upperCommand === 'L') {
      const x = readNumber();
      const y = readNumber();
      const next = {
        x: relative ? current.x + x : x,
        y: relative ? current.y + y : y,
      };
      addEdge(edges, source, current, next);
      current = next;
    } else if (upperCommand === 'H') {
      const x = readNumber();
      const next = { x: relative ? current.x + x : x, y: current.y };
      addEdge(edges, source, current, next);
      current = next;
    } else if (upperCommand === 'V') {
      const y = readNumber();
      const next = { x: current.x, y: relative ? current.y + y : y };
      addEdge(edges, source, current, next);
      current = next;
    } else if (upperCommand === 'Z') {
      addEdge(edges, source, current, subpathStart);
      current = subpathStart;
    } else {
      // Curves and arcs are intentionally ignored in v1; this app labels straight edges only.
      while (index < tokens.length && !isCommand(tokens[index])) {
        index += 1;
      }
    }
  }
};

const sanitizeSvg = (svgElement: SVGSVGElement) => {
  const blockedTags = svgElement.querySelectorAll('script, foreignObject, iframe, object, embed');
  blockedTags.forEach((element) => element.remove());

  svgElement.querySelectorAll('*').forEach((element) => {
    [...element.attributes].forEach((attribute) => {
      if (attribute.name.toLowerCase().startsWith('on')) {
        element.removeAttribute(attribute.name);
      }
    });
  });
};

const getCanvasMetrics = (svgElement: SVGSVGElement) => {
  const viewBox = svgElement.getAttribute('viewBox');
  const width = svgNumber(svgElement.getAttribute('width'), defaultCanvas.width);
  const height = svgNumber(svgElement.getAttribute('height'), defaultCanvas.height);

  if (viewBox) {
    const [, , viewBoxWidth, viewBoxHeight] = viewBox.split(/[\s,]+/).map(Number);
    return {
      viewBox,
      width: Number.isFinite(viewBoxWidth) ? viewBoxWidth : width,
      height: Number.isFinite(viewBoxHeight) ? viewBoxHeight : height,
    };
  }

  return {
    viewBox: `0 0 ${width} ${height}`,
    width,
    height,
  };
};

export const parseSvgDocument = (svgText: string): SvgDocumentModel => {
  const document = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  const parserError = document.querySelector('parsererror');
  const svgElement = document.querySelector('svg');

  if (parserError || !svgElement) {
    throw new Error('The selected file is not a valid SVG document.');
  }

  sanitizeSvg(svgElement);
  const edges: SvgEdge[] = [];

  svgElement.querySelectorAll('line').forEach((line, elementIndex) => {
    addEdge(
      edges,
      `line ${elementIndex + 1}`,
      { x: svgNumber(line.getAttribute('x1')), y: svgNumber(line.getAttribute('y1')) },
      { x: svgNumber(line.getAttribute('x2')), y: svgNumber(line.getAttribute('y2')) },
    );
  });

  svgElement.querySelectorAll('polyline, polygon').forEach((shape, elementIndex) => {
    const points = parsePoints(shape.getAttribute('points'));
    points.slice(1).forEach((point, pointIndex) => {
      addEdge(edges, `${shape.tagName} ${elementIndex + 1}`, points[pointIndex], point);
    });

    if (shape.tagName.toLowerCase() === 'polygon' && points.length > 2) {
      addEdge(edges, `${shape.tagName} ${elementIndex + 1}`, points[points.length - 1], points[0]);
    }
  });

  svgElement.querySelectorAll('rect').forEach((rect, elementIndex) => {
    const x = svgNumber(rect.getAttribute('x'));
    const y = svgNumber(rect.getAttribute('y'));
    const width = svgNumber(rect.getAttribute('width'));
    const height = svgNumber(rect.getAttribute('height'));
    const corners = [
      { x, y },
      { x: x + width, y },
      { x: x + width, y: y + height },
      { x, y: y + height },
    ];

    corners.forEach((corner, cornerIndex) => {
      addEdge(edges, `rect ${elementIndex + 1}`, corner, corners[(cornerIndex + 1) % corners.length]);
    });
  });

  svgElement.querySelectorAll('path').forEach((path, elementIndex) => {
    parsePathSegments(path.getAttribute('d'), `path ${elementIndex + 1}`, edges);
  });

  return {
    content: new XMLSerializer().serializeToString(svgElement),
    innerMarkup: svgElement.innerHTML,
    ...getCanvasMetrics(svgElement),
    edges,
  };
};

export const midpoint = (edge: SvgEdge): Point => ({
  x: (edge.start.x + edge.end.x) / 2,
  y: (edge.start.y + edge.end.y) / 2,
});

export const exportLabeledSvg = (svgContent: string, edgeAssignments: Record<string, EdgeAssignment>, edges: SvgEdge[]) => {
  const document = new DOMParser().parseFromString(svgContent, 'image/svg+xml');
  const svgElement = document.querySelector('svg');

  if (!svgElement) {
    throw new Error('Cannot export because no SVG is loaded.');
  }

  svgElement.querySelector('#svg-box-designer-labels')?.remove();

  const labelGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  labelGroup.setAttribute('id', 'svg-box-designer-labels');
  labelGroup.setAttribute('font-family', 'Inter, Arial, sans-serif');
  labelGroup.setAttribute('font-size', '16');
  labelGroup.setAttribute('font-weight', '700');
  labelGroup.setAttribute('fill', '#0f172a');
  labelGroup.setAttribute('paint-order', 'stroke');
  labelGroup.setAttribute('stroke', '#ffffff');
  labelGroup.setAttribute('stroke-width', '4');
  labelGroup.setAttribute('stroke-linejoin', 'round');

  edges.forEach((edge) => {
    const assignment = edgeAssignments[edge.id];
    if (!assignment) {
      return;
    }

    const center = midpoint(edge);
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', String(center.x));
    text.setAttribute('y', String(center.y));
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('dominant-baseline', 'middle');
    text.setAttribute('data-edge-id', edge.id);
    text.setAttribute('data-connection-id', assignment.connectionId);
    if (assignment.slotRole) {
      text.setAttribute('data-slot-role', assignment.slotRole);
    }
    text.textContent = assignment.connectionId;
    labelGroup.append(text);
  });

  svgElement.append(labelGroup);
  return new XMLSerializer().serializeToString(svgElement);
};
