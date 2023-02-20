package com.smockin.admin.dto.response;

import com.smockin.utils.GeneralUtils;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.Date;

@Data
@NoArgsConstructor
public class LiveLoggingS3DTO implements LiveLoggingPayloadDTO {

    private String id;
    private Date date;
    private String information;
    private String bucketOwnerId;

    public LiveLoggingS3DTO(final String id,
                            final String information,
                            final String bucketOwnerId) {
        this.id = id;
        this.date = GeneralUtils.getCurrentDate();
        this.information = information;
        this.bucketOwnerId = bucketOwnerId;
    }

}

