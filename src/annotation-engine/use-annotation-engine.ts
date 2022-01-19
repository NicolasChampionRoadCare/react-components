import { useRef, useMemo, useEffect, useCallback, RefObject, useImperativeHandle, ForwardedRef } from 'react';
import { Annotation, PointAnnotationPathData, AnnotationPathDataById, AnnotationStyle, Coordinates, StyleDataById, AnnotationPathData, PartialAnnotationStyle, AnnotationIdWithStyleData } from './models';
import defaultStyle from './style/defaultStyleOptions';
import { areCoordinatesInsideCircle, drawAnnotations, drawCurrentAnnotation, overloadStyle } from './utils';

interface UseAnnotationEngineArgs {
    annotations: Annotation[];
    annotationToEdit?: Annotation;
    onEvent: OnEvent;
    canvasRef: RefObject<HTMLCanvasElement>;
    ref: ForwardedRef<Handles>;
    styleForAnnotations: StyleDataById;
    styleForAnnotationToEdit?: PartialAnnotationStyle;
    styleForPointsToEdit?: StyleDataById;
}

export interface Handles {
    cancelCreation: () => void;
}

export type PointId = number;
export type Events =
    | MouseDownEvent
    | MouseDownOnExistingPointEvent
    | MouseMoveOnExistingPointEvent
    | MouseDownOnAnnotationEvent
    | MouseMoveOnAnnotationEvent
    | MouseMove
    | MouseUp
    | KeyUpEvent
    | KeyDownEvent
    | MouseUpOnExistingPointEvent
    | MouseWheelEvent
    | contextMenuEvent;

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

export interface MouseDownOnAnnotationEvent {
    type: 'mouse_down_on_annotation_event';
    at: Coordinates;
    annotationsId: string[];
    pointIds: Array<PointId>;
    currentGeometry: Array<Coordinates>;
    event: MouseEvent;
}

export interface MouseMoveOnAnnotationEvent {
    type: 'mouse_move_on_annotation_event';
    at: Coordinates;
    currentGeometry: Array<Coordinates>;
    annotationsIdsWithStyle: AnnotationIdWithStyleData[];
    pointIds: Array<PointId>;
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

export interface contextMenuEvent {
    type: 'context_menu_event';
    event: MouseEvent;
}

export interface Operations {
    addPoint(at: Coordinates): PointId;
    movePoint(pointId: PointId, to: Coordinates): void;
    finishCurrentLine(): void;
    drawOnCanvas(draw: (context2d: CanvasRenderingContext2D) => void): void;
    deleteLastPoint(): number;
}

const useAnnotationEngine = ({
    annotationToEdit,
    annotations,
    onEvent,
    canvasRef,
    ref,
    styleForAnnotations,
    styleForAnnotationToEdit,
    styleForPointsToEdit,
}: UseAnnotationEngineArgs): void => {
    const renderingContextRef = useRef<CanvasRenderingContext2D | undefined>(undefined);
    const annotationToEditPointsRef = useRef<Coordinates[]>([]);
    const annotationsPathsRef = useRef<AnnotationPathDataById>(new Map());
    const annotationToEditStyleRef = useRef<AnnotationStyle>(defaultStyle);
    const EXISTING_POINT_RADIUS_DETECTION = 8;

    const canvasCoordinateOf = (canvas: HTMLCanvasElement, event: MouseEvent): Coordinates => {
        const rect = canvas.getBoundingClientRect();

        return {
            x: event.clientX - rect.left,
            y: event.clientY - rect.top,
        };
    };

    const getMatchingAnnotationsId = (annotationsPathsMap: AnnotationPathDataById, { x, y }: Coordinates, renderingContext?: CanvasRenderingContext2D,): string[] => {
        const matchingAnnotationsId: string[] = [];
        const isPointInPath = (path: Path2D) => renderingContext?.isPointInPath(path, x, y);
        const isPointAnnotation = (pathData: AnnotationPathData): pathData is PointAnnotationPathData => (pathData as PointAnnotationPathData).point !== undefined;
        const isPointInShapeOrLabel = (pathData: AnnotationPathData): boolean => {

            if (isPointInPath(pathData.label)) {
                return true;
            }

            if (isPointAnnotation(pathData) && isPointInPath(pathData.point)) {
                return true;
            }

            if (!isPointAnnotation(pathData)) {
                return pathData.lines.some((line) => renderingContext?.isPointInStroke(line, x, y));
            }

            return false;
        }

        annotationsPathsMap.forEach((annotationPaths, annotationId) => {
            if (isPointInShapeOrLabel(annotationPaths)) {
                matchingAnnotationsId.push(annotationId)
            }
        })

        return matchingAnnotationsId;
    }

    const detectMoveOnExistingPoints = (coordinates: Array<Coordinates>, moveOn: Coordinates): Array<PointId> => {
        const coords = [...coordinates];
        coords.pop();

        return coords
            .map((coordinate, idx) => ({ coordinate, idx }))
            .filter(({ coordinate }) =>
                areCoordinatesInsideCircle(coordinate, moveOn, EXISTING_POINT_RADIUS_DETECTION),
            )
            .map(({ idx }) => idx);
    };

    useEffect(() => {
        annotationToEditStyleRef.current = overloadStyle(defaultStyle, styleForAnnotationToEdit)
    }, [styleForAnnotationToEdit]);

    useEffect(() => {
        annotationToEditPointsRef.current = [];
        annotationsPathsRef.current.forEach((_annotationPath: AnnotationPathData, id: string) => {
            if (!annotations.some((anno) => anno.id === id)) {
                annotationsPathsRef.current.delete(id);
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

        drawAnnotations(renderingContextRef.current, annotationsToDraw, styleForAnnotations, annotationsPathsRef.current);

        drawCurrentAnnotation(
            renderingContextRef.current,
            annotationToEditPointsRef.current,
            annotationToEditStyleRef.current,
            styleForPointsToEdit,
            annotationToEdit,
        );
    }, [annotationsToDraw, canvasRef, annotationToEdit, styleForAnnotations, styleForPointsToEdit]);

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
            // -1 is here because he return also the index of the array of points
            addPoint: (at: Coordinates) => annotationToEditPointsRef.current.push(at) - 1,
            movePoint: (pointId: PointId, to: Coordinates): void => {
                annotationToEditPointsRef.current[pointId] = to;
            },
            finishCurrentLine: () => {
                annotationToEditPointsRef.current = [];
            },
            drawOnCanvas: (draw: (context2d: CanvasRenderingContext2D) => void) => {
                delayDraw.push(draw);
            },
            deleteLastPoint: () => {
                annotationToEditPointsRef.current.splice((annotationToEditPointsRef.current).length - 2, 1);

                return annotationToEditPointsRef.current.length - 1;
            }
        };

        const clickedExistingPointsIds = (coordinates: Array<Coordinates>, clickAt: Coordinates): Array<PointId> => {
            const newCoordinates = [...coordinates];
            if (!annotationToEdit) {
                newCoordinates.pop();
            }

            return newCoordinates
                .map((coordinate, idx) => ({ coordinate, idx }))
                .filter(({ coordinate }) => areCoordinatesInsideCircle(coordinate, clickAt, EXISTING_POINT_RADIUS_DETECTION))
                .map(({ idx }) => idx);
        }

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
                const clickedPointIds = clickedExistingPointsIds(
                    annotationToEditPointsRef.current,
                    eventCoords,
                );
                if (clickedPointIds.length > 0) {
                    onEvent(
                        {
                            type: 'mouse_up_on_existing_point_event',
                            at: eventCoords,
                            pointIds: clickedPointIds,
                            currentGeometry: [...annotationToEditPointsRef.current],
                            event,
                        },
                        operations,
                    );
                } else {
                    const currentGeometry = [...annotationToEditPointsRef.current];
                    onEvent(
                        {
                            type: 'mouse_up_event',
                            at: eventCoords,
                            currentGeometry,
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

                const matchingAnnotationsId = getMatchingAnnotationsId(annotationsPathsRef.current, eventCoords, renderingContext);

                const clickedPointIds = clickedExistingPointsIds(
                    annotationToEditPointsRef.current,
                    eventCoords,
                );

                if (matchingAnnotationsId.length && !annotationToEdit) {
                    return onEvent(
                        {
                            type: 'mouse_down_on_annotation_event',
                            at: eventCoords,
                            event,
                            pointIds: clickedPointIds,
                            annotationsId: matchingAnnotationsId,
                            currentGeometry: [...annotationToEditPointsRef.current],
                        },
                        operations,
                    )
                }


                if (clickedPointIds.length > 0) {
                    return onEvent(
                        {
                            type: 'mouse_down_on_existing_point_event',
                            at: eventCoords,
                            pointIds: clickedPointIds,
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
                const matchingAnnotationsId = getMatchingAnnotationsId(annotationsPathsRef.current, eventCoords, renderingContext);
                const isMoveOnExistingPointsIdx = detectMoveOnExistingPoints(annotationToEditPointsRef.current, eventCoords);
                if (matchingAnnotationsId.length) {
                    const annotationsIdsWithStyle = matchingAnnotationsId.map((id) => {
                        const style = styleForAnnotations.get(id);

                        return ({ id, style });
                    })

                    return onEvent(
                        {
                            type: 'mouse_move_on_annotation_event',
                            at: eventCoords,
                            currentGeometry: [...annotationToEditPointsRef.current],
                            event,
                            annotationsIdsWithStyle,
                            pointIds: isMoveOnExistingPointsIdx,
                        },
                        operations,
                    )
                }

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
                        to: eventCoords,
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

        const handleContextMenu = (event: MouseEvent) =>
            handleEvent(() => {
                onEvent(
                    {
                        type: 'context_menu_event',
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
                currentCanvasRef.addEventListener("contextmenu", handleContextMenu);
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
                currentCanvasRef.removeEventListener("contextmenu", handleContextMenu);
                document.removeEventListener('keyup', handleKeyUp);
                document.removeEventListener('keydown', handleKeyDown);
            }
        };
    }, [drawScene, canvasRef, onEvent, annotations, styleForAnnotations, annotationToEdit, styleForPointsToEdit]);
};

export default useAnnotationEngine;
