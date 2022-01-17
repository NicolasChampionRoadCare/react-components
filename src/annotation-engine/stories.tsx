import { Story, Meta } from '@storybook/react';
import React, { useEffect, useState, useRef, RefObject } from 'react';
import styled from 'styled-components';
import Button from '../button';
import { Annotation, Coordinates, StyleData, StyleDataById } from './models';
import { clickStyle, editStyle, hiddenStyle, highlightStyle, hoverStyle } from './style/stories';
import { Events, Handles, Operations, PointId, KeyDownEvent, KeyUpEvent, MouseUp } from './use-annotation-engine';
import AnnotationEngine, { AnnotationEngineProps } from '.';

export default {
    title: 'Annotation Engine/Advanced usage',
    component: AnnotationEngine,
    argTypes: {
        onAnnotationEnded: { action: 'Annotation ended' },
    },
    args: {
        width: 539,
        height: 750,
        backgroundImagePath: 'https://posterstore.fr/images/zoom/mountain-road.jpg',
        foregroundImagePath: undefined,
        annotations: [],
    },
} as Meta;

interface StyledProps extends AnnotationEngineProps {
    width: number;
    height: number;
    ref: RefObject<Handles>;
}

const StyledAnnotationEngine = styled(AnnotationEngine)<StyledProps>`
    width: ${({ width }) => width}px;
    height: ${({ height }) => height}px;
`;

const AnnotationsContainer = styled.div`
    display: flex;
    flex-direction: row;
`;

const ActionContainer = styled.div`
    display: flex;
    align-self: flex-start;
    margin: 0 0.5rem;
    gap: 0.5rem;
`;

const Label = styled.label`
    color: white;
`;

const InnerContent = styled.div`
    background-color: wheat;
    border-radius: 12px;
    box-sizing: content-box;
    color: black;
    height: fit-content;
    margin: 12px auto;
    padding: 10px;
    width: fit-content;
`;

type SaveAnnotationFunction = (geometry: Array<Coordinates>, isClosed: boolean) => string;

const useSaveAnnotation = () => {
    const [annotations, setAnnotations] = useState<Annotation[]>([]);
    const [annotationToEdit, setAnnotationToEdit] = useState<Annotation | undefined>(undefined);
    const [selectedItemId, setSelectedItemId] = useState('');

    const saveAnnotation = (geometry: Array<Coordinates>, isClosed: boolean): string => {
        let id = '';
        setAnnotations(annotations.map((annotation) => {
            if (annotation.id === annotationToEdit?.id) {
                id = annotation.id;

                return { ...annotationToEdit, coordinates: geometry, isClosed };
            }

            return annotation;
        }));
        setAnnotationToEdit(undefined);
        if (!annotationToEdit) {
            id = `${annotations.length ? Number(annotations[annotations.length - 1].id) + 1 : 1}`;
            setAnnotations([...annotations, { id, name: `Mesure ${id}`, coordinates: geometry, isClosed }]);
        }
        setSelectedItemId(id);

        return id;
    };

    return {
        annotations,
        annotationToEdit, setAnnotationToEdit,
        saveAnnotation,
        selectedItemId,
        setSelectedItemId,
    }
}

/**
 * Manages all the necessary states for the Annotation Engine
 */
const useEngineStateMachine = (
    availableShapeTypes: Array<string>,
    annotationToEdit: Annotation | undefined,
    setAnnotationToEdit: React.Dispatch<React.SetStateAction<Annotation | undefined>>,
    saveAnnotation: SaveAnnotationFunction,
    refAE: RefObject<Handles>,
    setSelectedItemId: React.Dispatch<React.SetStateAction<string>>,
    styleOps: StyleOperations,
) => {
    const [numberOfPoints, setNumberOfPoints] = useState(0);
    const [shapeType, setShapeType] = useState(availableShapeTypes[0]);
    const [isShapeClosed, setIsShapeClosed] = useState(true);
    const [currentlyHoveredAnnotationId, setCurrentlyHoveredAnnotationId] = useState('');

    const isModeEdition = () => annotationToEdit !== undefined;
    const isModeCreation = () => !isModeEdition() && numberOfPoints > 0;
    const isModeInactif = () => !isModeCreation() && !isModeEdition();
    // key codes map for shape validation (polygon and polylines)
    const shapeFinishedOnKeyCodes = ['Space'];
    const cancelOnKeyCodes = ['Escape'];

    const initState = () => ({
        dragPoint: undefined,
    });
    const state = useRef<{
        dragPoint: PointId | undefined,
    }>(initState());

    const cancelCreationAndEdition = () => {
        state.current = initState();
        // Cancel edition
        setAnnotationToEdit(undefined);
        // Cancel creation
        refAE.current?.cancelCreation();
    };

    /**
     * Set limit of points and is closed logic for the shape when we change the Annotation Engine shape type
     */
    useEffect(() => {
        switch (shapeType) {
            case 'INACTIVE':
                setNumberOfPoints(0);
                break;
            case 'POINT':
            default:
                setNumberOfPoints(1);
                break;
            case 'LINE':
                setNumberOfPoints(2);
                break;
        }
        switch (shapeType) {
            case 'POLYLINE':
                setIsShapeClosed(false);
                break;
            default:
                setIsShapeClosed(true);
                break;
        }
    }, [shapeType]);

    /**
     * Set current shapeType when we edit another annotation
     */
    useEffect(() => {
        if (annotationToEdit !== undefined) {
            const { length } = annotationToEdit.coordinates;
            if (length === 1) {
                setShapeType('POINT');
            } else if (length === 2) {
                setShapeType('LINE');
            } else if (length > 2) {
                if (annotationToEdit.isClosed === true) {
                    setShapeType('POLYGON');
                } else {
                    setShapeType('POLYLINE');
                }
            }
        }
    }, [annotationToEdit]);

    const isGeometryComplete = (length: number) => {
        switch (shapeType) {
            case 'POINT':
                return length === 1;
            case 'LINE':
                return length === 2;
            default:
            case 'POLYGON':
            case 'POLYLINE':
                return false;
        }
    }

    /**
     * Dedicated to line, polygon and polylines shapes, return true if shape can be manually complete
     */
    const isGeometryReadyToBeManuallyCompleted = (length: number) => {
        switch (shapeType) {
            case 'LINE':
                return isModeEdition();
            case 'POLYGON':{
                const lengthToCheck = isModeEdition()
                    ? length
                    : length - 1;

                return lengthToCheck  >= 3;
            }
            case 'POLYLINE':
                return length >= 2;
            default:
                return false;
        }
    }

    /**
     * Dedicated to polygon shapes, return true if:
     * - shape is ready to be manually finished
     * - mouse is moving on the first point of the shape
     */
    const isPolygonReadyToBeManuallyCompletedByClickOnFirstPoint = (currentGeometry: Array<Coordinates>, pointIds: Array<PointId>) => {
        const { length } = currentGeometry;
        switch (shapeType) {
            case 'POLYGON':
                return isGeometryReadyToBeManuallyCompleted(length - 1) && pointIds.some((id) => id === 0);
            default:
                return false;
        }
    }

    const createNewPoint = (at: Coordinates, operations: Operations): number => operations.addPoint(at);

    const shapeFinished = (currentGeometry: Coordinates[]) => {
        state.current = initState();
        let geometryToSave = currentGeometry;
        // remove unnecessary temporary point (the one under the cursor)
        if (isModeCreation() && (shapeType !== 'POINT' && shapeType !== 'LINE')) {
                geometryToSave = currentGeometry.slice(0, currentGeometry.length - 1)
        }
        const id = saveAnnotation(geometryToSave, isShapeClosed);
        styleOps.removeStyleFromPointsByStyleNames(hiddenStyle.name);
        styleOps.setStyleExclusivelyToAnnotationId(clickStyle, id);
    };

    const keyDownEvent = (event: KeyDownEvent) => {
        if (event.event.code === 'Space') {
            // avoid page scrolldown on space key up
            event.event.preventDefault();
        }
    }

    const keyUpEvent = (event: KeyUpEvent) => {        
        if (shapeFinishedOnKeyCodes.includes(event.event.code) && isGeometryReadyToBeManuallyCompleted(event.currentGeometry.length)) {
            shapeFinished(event.currentGeometry);
        }
        if (cancelOnKeyCodes.includes(event.event.code)) {
            cancelCreationAndEdition();
        }
    }
    
    const mouseUpEvent = (event: MouseUp, operations: Operations) => {
        if (isGeometryComplete(event.currentGeometry.length)) {
            return shapeFinished(event.currentGeometry);
        }
        const newPointIndex = createNewPoint(event.at, operations);
         
        return styleOps.setStyleExclusivelyToPointId(hiddenStyle, `${newPointIndex}`)
    }
    
    const handleEvent = (event: Events, operations: Operations): void => {
        if (isModeInactif()) {
            switch (event.type) {
                case 'mouse_down_on_annotation_event':
                    setSelectedItemId(event.annotationsId[0]);
                    styleOps.setStyleExclusivelyToAnnotationId(clickStyle, event.annotationsId[0]);

                    break;

                case 'mouse_move_on_annotation_event': {
                    const { annotationsIdsWithStyle } = event;
                    const hoveredAnnotationsId = annotationsIdsWithStyle
                        .filter((annotation) => annotation?.style?.name !== clickStyle.name)
                        .map((annotation) => annotation.id);
                    const newHoveredAnnotationId = hoveredAnnotationsId[0];

                    if (newHoveredAnnotationId) {
                        if (currentlyHoveredAnnotationId !== newHoveredAnnotationId) {
                            setCurrentlyHoveredAnnotationId(newHoveredAnnotationId);
                        }
                        styleOps.setStyleExclusivelyToAnnotationId(hoverStyle, newHoveredAnnotationId);
                    }
                    break;
                }
                case 'mouse_move_event':
                    styleOps.removeStylesFromAnnotationsByStyleNames(hoverStyle.name);
                    break;
                default:
                    break;
            }
        }
        if (isModeCreation()) {
            switch (event.type) {
                
                case 'key_down_event':
                    keyDownEvent(event);
                    break;
                case 'key_up_event':
                    keyUpEvent(event);
                    break;
                case 'mouse_down_on_annotation_event':
                case 'mouse_down_on_existing_point_event':
                case 'mouse_down_event':
                    if (event.currentGeometry.length === 0) {
                        operations.addPoint(event.at);
                        styleOps.setStyleExclusivelyToPointId(hiddenStyle, '0');
                    }
                    styleOps.removeStyleFromPointsByStyleNames(hiddenStyle.name);
                    break;
                case 'mouse_move_on_existing_point_event':
                    if (isPolygonReadyToBeManuallyCompletedByClickOnFirstPoint(event.currentGeometry, event.pointIds)) {
                        styleOps.setStyleExclusivelyToPointId(highlightStyle, '0');
                    }
                    break;
                case 'mouse_move_on_annotation_event':
                    if (isPolygonReadyToBeManuallyCompletedByClickOnFirstPoint(event.currentGeometry, event.pointIds)) {
                        styleOps.setStyleExclusivelyToPointId(highlightStyle, '0');
                    } else {
                        styleOps.removeStyleFromPointsByStyleNames(highlightStyle.name)
                    }
                    // move point under cursor
                    operations.movePoint(event.currentGeometry.length - 1, event.at);
                    break;
                case 'mouse_move_event':
                    styleOps.removeStyleFromPointsByStyleNames(highlightStyle.name)
                    // move point under cursor
                    operations.movePoint(event.currentGeometry.length - 1, event.to);
                    break;
                case 'mouse_up_on_existing_point_event':
                    if (isPolygonReadyToBeManuallyCompletedByClickOnFirstPoint(event.currentGeometry, event.pointIds)) {
                        shapeFinished(event.currentGeometry);
                        break;
                    }
                    break;
                case 'mouse_up_event':
                    mouseUpEvent(event, operations);
                    break;
                case 'context_menu_event':
                        event.event.preventDefault()
                        break
                default:
                    // nothing to do
            }
        }
        if (isModeEdition()) {
            switch (event.type) {
                case 'key_down_event':
                    keyDownEvent(event);
                    break;
                case 'key_up_event':
                    keyUpEvent(event);
                    break;
                case 'mouse_down_on_existing_point_event':
                    [state.current.dragPoint] = event.pointIds;
                    break;
                case 'mouse_move_event':
                    if (state.current.dragPoint !== undefined) {
                        operations.movePoint(state.current.dragPoint, event.to);
                    }
                    break;
                case 'mouse_up_on_existing_point_event':
                case 'mouse_up_event':
                    if (shapeType === 'POINT') {
                        saveAnnotation(event.currentGeometry, isShapeClosed);
                    }
                    state.current.dragPoint = undefined;
                    break;
                default:
                    // nothing to do
            }
        }
    }

    return {
        handleEvent,
        shapeType, setShapeType,
        cancelCreationAndEdition,
    }
}

interface StyleOperations {
    styleForAnnotations: StyleDataById;
    styleForPointsToEdit: StyleDataById;
    annotationHasStyle(id: string, styleName: string): boolean;
    setStyleExclusivelyToAnnotationId(style: StyleData, id: string): void;
    setStyleExclusivelyToPointId(style: StyleData, id: string): void;
    setStyleToAnnotationsByIndexes(styleData: StyleData, ...annotationsId: string[]): void;
    removeStyleFromAnnotationsByIndexes(...annotationsId: string[]): void;
    removeStylesFromAnnotationsByStyleNames(...styleNames: string[]): void;
    removeStyleFromPointsByStyleNames(...styleNames: string[]): void;
}

/**
 * Allows to manage canvas drawing styles from outside the canvas 
 */
const useStyleOperations = (): StyleOperations => {
    // FIXME LATER : refacto exclusive styles
    // have for example a map of exclusive styles : key stylename value : one string/number

    const [styleForAnnotations, setStyleForAnnotations] = useState<StyleDataById>(new Map());
    const [styleForPointsToEdit, setStyleForPointsToEdit] = useState<StyleDataById>(new Map());
    const annotationHasStyle = (id: string, styleName: string): boolean => Boolean(styleForAnnotations.get(id)?.name === styleName);

    const setStyleToAnnotationsByIndexes = (style: StyleData, ...annotationsId: string[]): void => {
        const newStyleForAnnotations = new Map(styleForAnnotations);
        annotationsId.forEach((id) => {
            newStyleForAnnotations.set(id, style);
        })
        setStyleForAnnotations(newStyleForAnnotations);
    };

    const removeStyleFromAnnotationsByIndexes = (...annotationsId: string[]): void => {
        const newStyleForAnnotations = new Map(styleForAnnotations);
        annotationsId.forEach((id) => {
            newStyleForAnnotations.delete(id);
        })
        setStyleForAnnotations(newStyleForAnnotations);
    };

    const setStyleExclusivelyToId = (setState: React.Dispatch<React.SetStateAction<StyleDataById>>, state: StyleDataById, exclusiveStyle: StyleData, itemId: string) => {
        const newState: StyleDataById = new Map(state);
        newState.forEach((style, id) => {
            if (style.name === exclusiveStyle.name) {
                newState.delete(id);
            }
        })
        newState.set(itemId, exclusiveStyle);
        setState(newState);
    };

    const setStyleExclusivelyToAnnotationId = (exclusiveStyle: StyleData, annotationId: string): void => {
        setStyleExclusivelyToId(setStyleForAnnotations, styleForAnnotations, exclusiveStyle, annotationId)
    };

    const setStyleExclusivelyToPointId = (exclusiveStyle: StyleData, pointId: string): void => {
        setStyleExclusivelyToId(setStyleForPointsToEdit, styleForPointsToEdit, exclusiveStyle, pointId)
    }

    const removeStylesFromAnnotationsByStyleNames = (...styleNames: string[]): void => {
        const newStyleForAnnotations = new Map(styleForAnnotations);
        newStyleForAnnotations.forEach((styleData, annotationId) => {
            if (styleNames.includes(styleData.name)) {
                newStyleForAnnotations.delete(annotationId);
            }
        })
        setStyleForAnnotations(newStyleForAnnotations);
    };
    // FIXME later : refacto (or not, if StyleDataById are split between anno and points styles)
    const removeStyleFromPointsByStyleNames = (...styleNames: string[]): void => {
        const newStyleForPointsToEdit = new Map(styleForPointsToEdit);
        newStyleForPointsToEdit.forEach((styleData, annotationId) => {
            if (styleNames.includes(styleData.name)) {
                newStyleForPointsToEdit.delete(annotationId);
            }
        })
        setStyleForPointsToEdit(newStyleForPointsToEdit);
    };

    return {
        setStyleToAnnotationsByIndexes,
        removeStyleFromAnnotationsByIndexes,
        annotationHasStyle,
        styleForAnnotations,
        styleForPointsToEdit,
        setStyleExclusivelyToAnnotationId,
        removeStylesFromAnnotationsByStyleNames,
        removeStyleFromPointsByStyleNames,
        setStyleExclusivelyToPointId,
    }
};

const RoadcareBehaviorTemplate: Story<StyledProps> = ({ width, height, ...args }) => {
    const availableShapeTypes: Array<string> = ['INACTIVE', 'POINT', 'LINE', 'POLYGON', 'POLYLINE'];
    const refAE = useRef<Handles>(null);
    const styleOps = useStyleOperations();
    const styleForAnnotationToEdit = editStyle.style;

    const {
        annotations,
        annotationToEdit, setAnnotationToEdit,
        saveAnnotation,
        selectedItemId,
        setSelectedItemId,
    } = useSaveAnnotation();


    const {
        handleEvent,
        shapeType, setShapeType,
        cancelCreationAndEdition,
    } = useEngineStateMachine(
            availableShapeTypes,
            annotationToEdit,
            setAnnotationToEdit,
            saveAnnotation, 
            refAE,
            setSelectedItemId,
            styleOps
        );
  
    const handleMouseLeave = (): void => {
        styleOps.removeStylesFromAnnotationsByStyleNames(hoverStyle.name);
    };

    const handleMouseOver = (id: string): void => {
        if (!styleOps.annotationHasStyle(id, clickStyle.name)) {
            styleOps.setStyleExclusivelyToAnnotationId(hoverStyle, id);
        }
    }

    const handleClick = (id: string): void => {
        styleOps.setStyleExclusivelyToAnnotationId(clickStyle, id);
        setSelectedItemId(id);
    };

    const handleKeyDown = (event: React.KeyboardEvent, id: string) => {
        if (event.code === 'Space') {
            styleOps.setStyleExclusivelyToAnnotationId(clickStyle, id)
            setSelectedItemId(id);
        }
    }
 
    return (
        <AnnotationsContainer>
            <StyledAnnotationEngine
                height={height}
                width={width}
                {...args}
                ref={refAE}
                annotationToEdit={annotationToEdit}
                annotations={annotations}
                onEvent={handleEvent}
                styleForAnnotationToEdit={styleForAnnotationToEdit}
                styleForAnnotations={styleOps.styleForAnnotations}
                styleForPointsToEdit={styleOps.styleForPointsToEdit}
            >
                <InnerContent>Inner container</InnerContent>
            </StyledAnnotationEngine>
            <ActionContainer>
                <Label>Type de forme</Label>
                <select onChange={(event) => setShapeType(event.target.value)} value={shapeType}>
                    {
                        availableShapeTypes.map((sType) => (<option key={sType} value={sType}>{sType}</option>))
                    }
                </select>
                <Button label="Cancel edition" onClick={cancelCreationAndEdition} type="button" />
            </ActionContainer>
            <div style={{ color: 'white' }}>
                {annotations.map((annotation: Annotation) => (
                    <div key={annotation.id}>
                        <span 
                            onClick={() => handleClick(annotation.id)}
                            // FIXME LATER onFocus is for linter. 
                            // eslint-disable-next-line @typescript-eslint/no-empty-function
                            onFocus={() => {}}
                            onKeyDown={(event) => handleKeyDown(event, annotation.id)}
                            onMouseLeave={() => handleMouseLeave()}
                            onMouseOver={() => handleMouseOver(annotation.id)}
                            role="button"
                            style={{color: `${annotation.id === selectedItemId ? 'red' : ''}`}}
                            tabIndex={0}
                        >{annotation.name}{' '}</span>
                        <button onClick={() => {
                            setAnnotationToEdit(annotation);
                            styleOps.removeStylesFromAnnotationsByStyleNames(clickStyle.name)
                        }} type="button">
                            EDIT
                        </button>
                    </div>
                ))}
            </div>
        </AnnotationsContainer>
    );
};

export const RoadcareBehavior = RoadcareBehaviorTemplate.bind({});
