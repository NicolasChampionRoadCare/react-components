import React, { FC, useRef } from 'react';
import AnnotationEngine from '../annotation-engine';
import { Annotation, Coordinates } from '../annotation-engine/models';
import { Events, Operations, PointId } from '../annotation-engine/use-annotation-engine';

export interface AnnotationEngineProps {
    className?: string;
    annotations: Annotation[];
    annotationToEdit?: Annotation;
    backgroundImagePath: string;
    foregroundImagePath?: string;
    id?: string;
    numberOfPoints?: number;
    onAnnotationEnded?: (annotationPoints: Coordinates[]) => void;
    onAnnotationDragged?: (annotationPoints: Coordinates[], context2d: CanvasRenderingContext2D) => void;
}

const BasicAnnotationEngine: FC<AnnotationEngineProps> = ({
    annotationToEdit,
    annotations = [],
    backgroundImagePath,
    className,
    foregroundImagePath,
    id = 'annotation-engine',
    numberOfPoints = 2,
    onAnnotationEnded,
    onAnnotationDragged,
}) => {
    const initState = () => ({
        dragOngoing: false,
        dragPoint: 0,
    });
    const state = useRef<{
        dragOngoing: boolean,
        dragPoint: PointId,
    }>(initState());
    const notifyAnnotationEnd = (geometry: Array<Coordinates>) => {
        if (onAnnotationEnded) {
            onAnnotationEnded(geometry);
        }
    };
    const isCreationMode = () => annotationToEdit === undefined;
    const isEditionMode = () => annotationToEdit !== undefined;
    const isGeometryComplete = (geometry: Array<Coordinates>) => geometry.length >= numberOfPoints;
    const onEvent = (event: Events, operations: Operations) => {
        switch (event.type) {
            case 'mouse_down_event':
                if (isCreationMode()) {
                    operations.addPoint(event.at);
                }
                if (isEditionMode()) {
                    notifyAnnotationEnd(event.currentGeometry);
                }
                break;
            case 'mouse_down_on_existing_point_event':
                state.current.dragOngoing = true;
                [ state.current.dragPoint ] = event.pointIds;
                break;
            case 'mouse_move_event':
                if (state.current.dragOngoing) {
                    operations.movePoint(state.current.dragPoint, event.to);
                    if (onAnnotationDragged) {
                        operations.drawOnCanvas((context2d) => onAnnotationDragged(event.currentGeometry, context2d));
                    }
                }
                break;
            case 'context_menu_event':
                    console.info('contextmenu', event)
                    event.event.preventDefault()
                    break
            case 'mouse_up_on_existing_point_event':
            case 'mouse_up_event':
                if (state.current.dragOngoing) {
                    state.current.dragOngoing = false;
                }
                if (isCreationMode() && isGeometryComplete(event.currentGeometry)) {
                    operations.finishCurrentLine();
                    state.current = initState();
                    notifyAnnotationEnd(event.currentGeometry);
                }
                break;
            default:
                // nothing to do
        }
    };

    return (
        <AnnotationEngine
            annotationToEdit={annotationToEdit}
            annotations={annotations}
            backgroundImagePath={backgroundImagePath}
            className={className}
            foregroundImagePath={foregroundImagePath}
            id={id}
            onEvent={onEvent}
        />
    );
};

export default BasicAnnotationEngine;
