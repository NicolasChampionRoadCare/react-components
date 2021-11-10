import { useRef, useMemo, useEffect, useCallback, RefObject, useImperativeHandle, ForwardedRef } from 'react';
import { Annotation, AnnotationPathData, Coordinates, InputStyleOptions, StyleOptions } from './models';
import { areCoordinatesInsideCircle, drawAnnotations, drawCurrentAnnotation } from './utils';

interface UseAnnotationEngineArgs {
    annotations: Annotation[];
    annotationToEdit?: Annotation;
    onEvent: OnEvent;
    canvasRef: RefObject<HTMLCanvasElement>;
    ref: ForwardedRef<Handles>;
}

export interface Handles {
    cancelCreation: () => void;
}

export type PointId = number;
export type Events =
    | MouseDownEvent
    | MouseDownOnExistingPointEvent
    | MouseMoveOnExistingPointEvent
    | MouseDownOnLabelEvent
    | MouseMoveOnLabelEvent
    | MouseMove
    | MouseUp
    | KeyUpEvent
    | KeyDownEvent
    | MouseUpOnExistingPointEvent
    | MouseWheelEvent;
export type OnEvent = (event: Events, operations: Operations) => void;

export interface MouseDownEvent {
    type: 'mouse_down_event';
    at: Coordinates;
    currentGeometry: Array<Coordinates>;
    event: MouseEvent;
}

export interface MouseDownOnExistingPointEvent {
    type: 'mouse_down_on_existing_point_event';
    at: Coordinates;
    pointIds: Array<PointId>;
    currentGeometry: Array<Coordinates>;
    event: MouseEvent;
}

export interface MouseDownOnLabelEvent {
    type: 'mouse_down_on_label_event';
    at: Coordinates;
    annotationsId: string[];
    event: MouseEvent;
}

export interface MouseMoveOnLabelEvent {
    type: 'mouse_move_on_label_event';
    at: Coordinates;
    annotationsId: string[];
    event: MouseEvent;
}

export interface MouseMove {
    type: 'mouse_move_event';
    to: Coordinates;
    currentGeometry: Array<Coordinates>;
    event: MouseEvent;
}

export interface MouseUp {
    type: 'mouse_up_event';
    at: Coordinates;
    currentGeometry: Array<Coordinates>;
    event: MouseEvent;
}

export interface MouseUpOnExistingPointEvent {
    type: 'mouse_up_on_existing_point_event';
    at: Coordinates;
    pointIds: Array<PointId>;
    currentGeometry: Array<Coordinates>;
    event: MouseEvent;
}

export interface MouseMoveOnExistingPointEvent {
    type: 'mouse_move_on_existing_point_event';
    at: Coordinates;
    pointIds: Array<PointId>;
    currentGeometry: Array<Coordinates>;
    event: MouseEvent;
}

export interface MouseWheelEvent {
    type: 'mouse_wheel_event';
    deltaX: number;
    deltaY: number;
    event: WheelEvent;
}

export interface KeyUpEvent {
    type: 'key_up_event';
    currentGeometry: Array<Coordinates>;
    event: KeyboardEvent;
}

export interface KeyDownEvent {
    type: 'key_down_event';
    currentGeometry: Array<Coordinates>;
    event: KeyboardEvent;
}

export interface Operations {
    addPoint(at: Coordinates): PointId;
    highlightExistingPoint(pointId: PointId): void;
    removeHighlightPoint(): void;
    setStyleToAnnotation(annotationId: string, stylingData: InputStyleOptions): void;
    removeStylesFromAnnotationsByStyleNames(styleNames: string[]): void;
    movePoint(pointId: PointId, to: Coordinates): void;
    finishCurrentLine(): void;
    drawOnCanvas(draw: (context2d: CanvasRenderingContext2D) => void): void;
}

const useAnnotationEngine = ({
    annotationToEdit,
    annotations,
    onEvent,
    canvasRef,
    ref,
}: UseAnnotationEngineArgs): void => {
    const renderingContextRef = useRef<CanvasRenderingContext2D | undefined>(undefined);
    const annotationToEditPointsRef = useRef<Coordinates[]>([]);
    const annotationHighlightPointIndexRef = useRef<number | undefined>(undefined);
    const styledAnnotations = useRef<Map<string, StyleOptions>>(new Map());
    const annotationsPaths = useRef<Map<string, AnnotationPathData>>(new Map());
    const MOVE_ON_EXISTING_POINTS_RADIUS_DETECTION = 4;

    const canvasCoordinateOf = (canvas: HTMLCanvasElement, event: MouseEvent): Coordinates => {
        const rect = canvas.getBoundingClientRect();

        return {
            x: event.clientX - rect.left,
            y: event.clientY - rect.top,
        };
    };

    const getMatchingAnnotationsId = (annotationsPathsMap: Map<string, AnnotationPathData>, { x, y }: Coordinates, renderingContext?: CanvasRenderingContext2D,): string[] => {
        const clickedLabelAnnotationsId: string[] = [];
        annotationsPathsMap.forEach((annotationPaths, annotationId) => {
            if (renderingContext?.isPointInPath(annotationPaths.label, x, y)) {
                clickedLabelAnnotationsId.push(annotationId)
            }
        })

        return clickedLabelAnnotationsId;
    }

    const detectClickOnExistingPoints = (coordinates: Array<Coordinates>, clickAt: Coordinates): Array<PointId> =>
        coordinates
            .map((coordinate, idx) => ({ coordinate, idx }))
            .filter(({ coordinate }) => areCoordinatesInsideCircle(coordinate, clickAt, 7))
            .map(({ idx }) => idx);

    const detectMoveOnExistingPoints = (coordinates: Array<Coordinates>, moveOn: Coordinates): Array<PointId> => {
        const coords = [...coordinates];
        coords.pop();

        return coords
            .map((coordinate, idx) => ({ coordinate, idx }))
            .filter(({ coordinate }) =>
                areCoordinatesInsideCircle(coordinate, moveOn, MOVE_ON_EXISTING_POINTS_RADIUS_DETECTION),
            )
            .map(({ idx }) => idx);
    };

    useEffect(() => {
        annotationsPaths.current.forEach((_annotationPath: AnnotationPathData, id: string) => {
            if (!annotations.map((anno) => anno.id).includes(id)) {
                annotationsPaths.current.delete(id);
            }
        })

        if (annotationToEdit) {
            annotationToEditPointsRef.current = annotationToEdit.coordinates;
        } else {
            annotationToEditPointsRef.current = [];
        }
    }, [annotationToEdit, annotations]);

    const annotationsToDraw = useMemo<Annotation[]>(() => {
        if (annotationToEdit) {
            const annotationToEditIndex = annotations.findIndex(
                (annotation: Annotation) => annotation.id === annotationToEdit.id,
            );

            if (annotationToEditIndex >= 0) {
                return [
                    ...annotations.slice(0, annotationToEditIndex),
                    ...annotations.slice(annotationToEditIndex + 1),
                ];
            }
        }

        return [...annotations];
    }, [annotations, annotationToEdit]);

    const drawScene = useCallback(() => {
        const currentCanvasRef = canvasRef.current;

        if (!renderingContextRef.current || !currentCanvasRef) {
            return;
        }

        renderingContextRef.current.clearRect(0, 0, currentCanvasRef.width, currentCanvasRef.height);

        drawAnnotations(renderingContextRef.current, annotationsToDraw, styledAnnotations.current, annotationsPaths.current);

        drawCurrentAnnotation(
            renderingContextRef.current,
            annotationToEditPointsRef.current,
            annotationToEditPointsRef.current === annotationToEdit?.coordinates,
            annotationHighlightPointIndexRef.current,
            annotationToEdit,
        );
    }, [annotationsToDraw, canvasRef, annotationToEdit]);

    useImperativeHandle(ref, () => ({
        cancelCreation() {
            if (annotationToEdit === undefined) {
                annotationToEditPointsRef.current = [];
                drawScene();
            }
        },
    }));

    // Initialize canvas
    useEffect(() => {
        const currentCanvasRef = canvasRef.current;

        let delayDraw: Array<(context2d: CanvasRenderingContext2D) => void> = [];
        const operations: Operations = {
            addPoint: (at: Coordinates) => annotationToEditPointsRef.current.push(at) - 1,
            highlightExistingPoint: (pointId: PointId) => {
                annotationHighlightPointIndexRef.current = pointId;
            },
            removeHighlightPoint: () => {
                annotationHighlightPointIndexRef.current = undefined;
            },
            setStyleToAnnotation: (annotationId: string, stylingStatus: InputStyleOptions) => {
                const { name, priority, style } = stylingStatus;
                const previouslyStyledAnnotationsId = styledAnnotations.current.get(name)?.annotationsId || [];
                styledAnnotations.current.set(name, {
                    annotationsId: [...previouslyStyledAnnotationsId, annotationId],
                    priority,
                    style,
                });
            },
            removeStylesFromAnnotationsByStyleNames: (styleNames: string[]): void => {
                styleNames.forEach((styleName) => styledAnnotations.current.delete(styleName));
            },
            movePoint: (pointId: PointId, to: Coordinates) => {
                annotationToEditPointsRef.current[pointId] = to;
            },
            finishCurrentLine: () => {
                annotationToEditPointsRef.current = [];
            },
            drawOnCanvas: (draw: (context2d: CanvasRenderingContext2D) => void) => {
                delayDraw.push(draw);
            },
        };

        const handleEvent = (handler: (canvas: HTMLCanvasElement) => void) => {
            if (currentCanvasRef) {
                handler(currentCanvasRef);
                drawScene();
                const context2d = currentCanvasRef.getContext('2d');
                if (context2d) {
                    delayDraw.forEach((draw) => draw(context2d));
                }
                delayDraw = [];
            }
        };

        const handleMouseUp = (event: MouseEvent) =>
            handleEvent((canvas) => {
                const eventCoords = canvasCoordinateOf(canvas, event);
                const isClickOnExistingPointsIdx = detectClickOnExistingPoints(
                    annotationToEditPointsRef.current,
                    eventCoords,
                );

                if (isClickOnExistingPointsIdx.length > 0) {
                    onEvent(
                        {
                            type: 'mouse_up_on_existing_point_event',
                            at: eventCoords,
                            pointIds: isClickOnExistingPointsIdx,
                            currentGeometry: [...annotationToEditPointsRef.current],
                            event,
                        },
                        operations,
                    );
                } else {
                    onEvent(
                        {
                            type: 'mouse_up_event',
                            at: eventCoords,
                            currentGeometry: [...annotationToEditPointsRef.current],
                            event,
                        },
                        operations,
                    );
                }
            });

        const handleMouseDown = (event: MouseEvent) =>
            handleEvent((canvas) => {
                const eventCoords = canvasCoordinateOf(canvas, event);
                const renderingContext = renderingContextRef.current;

                const matchingAnnotationsId = getMatchingAnnotationsId(annotationsPaths.current, eventCoords, renderingContext);

                if (matchingAnnotationsId.length) {
                    return onEvent(
                        {
                            type: 'mouse_down_on_label_event',
                            at: eventCoords,
                            event,
                            annotationsId: matchingAnnotationsId,
                        },
                        operations,
                    )
                }

                const isClickOnExistingPointsIdx = detectClickOnExistingPoints(
                    annotationToEditPointsRef.current,
                    eventCoords,
                );

                if (isClickOnExistingPointsIdx.length > 0) {
                    return onEvent(
                        {
                            type: 'mouse_down_on_existing_point_event',
                            at: eventCoords,
                            pointIds: isClickOnExistingPointsIdx,
                            currentGeometry: [...annotationToEditPointsRef.current],
                            event,
                        },
                        operations,
                    );
                } 

                return onEvent(
                    {
                        type: 'mouse_down_event',
                        at: eventCoords,
                        currentGeometry: [...annotationToEditPointsRef.current],
                        event,
                    },
                    operations,
                );
                
            });

        const handleMouseMove = (event: MouseEvent) =>
            handleEvent((canvas) => {
                const eventCoords = canvasCoordinateOf(canvas, event);
                const renderingContext = renderingContextRef.current;
                const matchingAnnotationsId = getMatchingAnnotationsId(annotationsPaths.current, eventCoords, renderingContext);
              
                if (matchingAnnotationsId.length) {
                    return onEvent(
                        {
                            type: 'mouse_move_on_label_event',
                            at: eventCoords,
                            event,
                            annotationsId: matchingAnnotationsId,
                        },
                        operations,
                    )

                }

                const isMoveOnExistingPointsIdx = detectMoveOnExistingPoints(annotationToEditPointsRef.current, eventCoords);

                if (isMoveOnExistingPointsIdx.length > 0) {
                    return onEvent(
                        {
                            type: 'mouse_move_on_existing_point_event',
                            at: eventCoords,
                            pointIds: isMoveOnExistingPointsIdx,
                            currentGeometry: [...annotationToEditPointsRef.current],
                            event,
                        },
                        operations,
                    );
                } 

                return onEvent(
                    {
                        type: 'mouse_move_event',
                        to: canvasCoordinateOf(canvas, event),
                        currentGeometry: [...annotationToEditPointsRef.current],
                        event,
                    },
                    operations,
                );
                
            });

        const handleMouseWheel = (event: WheelEvent) =>
            handleEvent(() => {
                onEvent(
                    {
                        type: 'mouse_wheel_event',
                        deltaX: event.deltaX,
                        deltaY: event.deltaY,
                        event,
                    },
                    operations,
                );
            });

        const handleKeyUp = (event: KeyboardEvent) =>
            handleEvent(() => {
                onEvent(
                    {
                        type: 'key_up_event',
                        currentGeometry: [...annotationToEditPointsRef.current],
                        event,
                    },
                    operations,
                );
            });

        const handleKeyDown = (event: KeyboardEvent) =>
            handleEvent(() => {
                onEvent(
                    {
                        type: 'key_down_event',
                        currentGeometry: [...annotationToEditPointsRef.current],
                        event,
                    },
                    operations,
                );
            });

        if (currentCanvasRef) {
            const canvasRenderingContext = currentCanvasRef.getContext('2d');

            if (canvasRenderingContext) {
                currentCanvasRef.addEventListener('mousedown', handleMouseDown);
                currentCanvasRef.addEventListener('mouseup', handleMouseUp);
                currentCanvasRef.addEventListener('mousemove', handleMouseMove);
                currentCanvasRef.addEventListener('wheel', handleMouseWheel);
                document.addEventListener('keyup', handleKeyUp);
                document.addEventListener('keydown', handleKeyDown);

                currentCanvasRef.width = currentCanvasRef.offsetWidth;
                currentCanvasRef.height = currentCanvasRef.offsetHeight;

                renderingContextRef.current = canvasRenderingContext;

                drawScene();
            }
        }

        return () => {
            if (currentCanvasRef) {
                currentCanvasRef.removeEventListener('mouseup', handleMouseUp);
                currentCanvasRef.removeEventListener('mousedown', handleMouseDown);
                currentCanvasRef.removeEventListener('mousemove', handleMouseMove);
                currentCanvasRef.removeEventListener('wheel', handleMouseWheel);
                document.removeEventListener('keyup', handleKeyUp);
                document.removeEventListener('keydown', handleKeyDown);
            }
        };
    }, [drawScene, canvasRef, onEvent, annotations]);
};

export default useAnnotationEngine;
