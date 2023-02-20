package com.smockin.admin.service;

import com.smockin.admin.dto.RestfulMockDTO;
import com.smockin.admin.dto.response.RestfulMockResponseDTO;
import com.smockin.admin.exception.RecordNotFoundException;
import com.smockin.admin.exception.ValidationException;

import java.util.List;

/**
 * Created by mgallina.
 */
public interface RestfulMockService {

    RestfulMockResponseDTO loadEndpoint(final String mockExtId, final String token) throws RecordNotFoundException, ValidationException;
    String createEndpoint(final RestfulMockDTO dto, final String token) throws RecordNotFoundException, ValidationException;
    void updateEndpoint(final String mockExtId, final RestfulMockDTO dto, final String token) throws RecordNotFoundException, ValidationException;
    void deleteEndpoint(final String mockExtId, final String token) throws RecordNotFoundException, ValidationException;
    List<RestfulMockResponseDTO> loadAll(final String token) throws RecordNotFoundException;

}
